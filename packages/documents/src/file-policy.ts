import { AppError, validationFailed } from "@job-checker/contracts";
import { env } from "@job-checker/observability/env";

export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMediaType = (typeof ALLOWED_TYPES)[number];

const EXTENSIONS: Record<AllowedMediaType, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"]
};

export type UploadMetadata = {
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256?: string;
};

export function validateUploadMetadata(metadata: UploadMetadata): void {
  const fieldErrors: Array<{ field: string; message: string }> = [];
  const contentType = metadata.contentType.toLowerCase() as AllowedMediaType;
  if (!ALLOWED_TYPES.includes(contentType)) {
    fieldErrors.push({
      field: "contentType",
      message: "Only PDF, JPEG, and PNG files are accepted."
    });
  }
  const lowerName = metadata.fileName.toLowerCase();
  const extension = lowerName.slice(lowerName.lastIndexOf("."));
  if (!ALLOWED_TYPES.includes(contentType) || !EXTENSIONS[contentType].includes(extension)) {
    fieldErrors.push({
      field: "fileName",
      message: "The file extension does not match the file type."
    });
  }
  if (!Number.isInteger(metadata.byteSize) || metadata.byteSize <= 0) {
    fieldErrors.push({ field: "byteSize", message: "The file is empty." });
  }
  if (metadata.byteSize > env().MAX_UPLOAD_BYTES) {
    fieldErrors.push({ field: "byteSize", message: "The file exceeds the 20 MB limit." });
  }
  if (metadata.sha256 && !/^[a-f0-9]{64}$/i.test(metadata.sha256)) {
    fieldErrors.push({ field: "sha256", message: "The checksum must be a SHA-256 hex digest." });
  }
  if (fieldErrors.length > 0) throw validationFailed(fieldErrors);
}

export function detectMediaType(bytes: Buffer): AllowedMediaType | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export function assertContentMatchesType(bytes: Buffer, contentType: AllowedMediaType): void {
  const detected = detectMediaType(bytes);
  if (detected !== contentType) {
    throw new AppError(
      "UPLOAD_INVALID",
      422,
      "The file contents do not match the declared file type."
    );
  }
  if (bytes.length > env().MAX_UPLOAD_BYTES) {
    throw new AppError("UPLOAD_INVALID", 422, "The file exceeds the 20 MB limit.");
  }
}

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const ACTIVE_PDF_MARKERS: Array<{ marker: string; code: string }> = [
  { marker: "/JavaScript", code: "PDF_JAVASCRIPT" },
  { marker: "/JS", code: "PDF_JAVASCRIPT" },
  { marker: "/Launch", code: "PDF_LAUNCH_ACTION" },
  { marker: "/EmbeddedFile", code: "PDF_EMBEDDED_FILE" },
  { marker: "/OpenAction", code: "PDF_OPEN_ACTION" },
  { marker: "/AA", code: "PDF_ADDITIONAL_ACTION" },
  { marker: "/RichMedia", code: "PDF_RICH_MEDIA" },
  { marker: "/XFA", code: "PDF_XFA_FORM" }
];

export type ScanVerdict = {
  verdict: "CLEAN" | "QUARANTINED" | "NEEDS_INPUT";
  reasonCode: string | null;
  scannerVersion: string;
};

export function policyScan(bytes: Buffer, mediaType: AllowedMediaType): ScanVerdict {
  const text = bytes.toString("latin1");
  if (text.includes(EICAR)) {
    return {
      verdict: "QUARANTINED",
      reasonCode: "MALWARE_EICAR",
      scannerVersion: "policy-scan-1.0"
    };
  }
  if (mediaType === "application/pdf") {
    if (text.includes("/Encrypt")) {
      return {
        verdict: "QUARANTINED",
        reasonCode: "PDF_ENCRYPTED",
        scannerVersion: "policy-scan-1.0"
      };
    }
    for (const marker of ACTIVE_PDF_MARKERS) {
      if (text.includes(marker.marker)) {
        return {
          verdict: "QUARANTINED",
          reasonCode: marker.code,
          scannerVersion: "policy-scan-1.0"
        };
      }
    }
    if (!text.includes("%%EOF")) {
      return {
        verdict: "NEEDS_INPUT",
        reasonCode: "PDF_CORRUPT",
        scannerVersion: "policy-scan-1.0"
      };
    }
  }
  if (mediaType === "image/png" && !text.includes("IEND")) {
    return {
      verdict: "NEEDS_INPUT",
      reasonCode: "IMAGE_MALFORMED",
      scannerVersion: "policy-scan-1.0"
    };
  }
  if (mediaType === "image/jpeg" && !bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) {
    return {
      verdict: "NEEDS_INPUT",
      reasonCode: "IMAGE_MALFORMED",
      scannerVersion: "policy-scan-1.0"
    };
  }
  return { verdict: "CLEAN", reasonCode: null, scannerVersion: "policy-scan-1.0" };
}

export async function clamAvScan(bytes: Buffer): Promise<ScanVerdict> {
  const net = await import("node:net");
  const host = env().CLAMAV_HOST;
  const port = env().CLAMAV_PORT;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new AppError("EXTRACTION_FAILED", 503, "The malware scanner timed out.", {
          retryable: true
        })
      );
    }, 15_000);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length, 0);
      socket.write(size);
      socket.write(bytes);
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      clearTimeout(timer);
      const response = Buffer.concat(chunks).toString("utf8");
      if (response.includes("FOUND")) {
        resolve({
          verdict: "QUARANTINED",
          reasonCode: "MALWARE_CLAMAV",
          scannerVersion: "clamav"
        });
      } else if (response.includes("OK")) {
        resolve({ verdict: "CLEAN", reasonCode: null, scannerVersion: "clamav" });
      } else {
        reject(
          new AppError("EXTRACTION_FAILED", 503, "The scanner returned an unknown response.", {
            retryable: true
          })
        );
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new AppError("EXTRACTION_FAILED", 503, "The malware scanner is unavailable.", {
          retryable: true,
          details: { cause: error.message }
        })
      );
    });
  });
}

export async function scanDocumentBytes(
  bytes: Buffer,
  contentType: AllowedMediaType
): Promise<ScanVerdict> {
  if (env().SCAN_MODE === "clamav") return clamAvScan(bytes);
  return policyScan(bytes, contentType);
}
