import { describe, expect, it } from "vitest";
import {
  assertContentMatchesType,
  detectMediaType,
  policyScan,
  validateUploadMetadata
} from "@job-checker/documents";

function pdf(body: string): Buffer {
  return Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`, "latin1");
}

describe("file policy", () => {
  it("detects PDF, JPEG, and PNG signatures", () => {
    expect(detectMediaType(pdf("hello"))).toBe("application/pdf");
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectMediaType(Buffer.from("89504e470d0a1a0a", "hex"))).toBe("image/png");
    expect(detectMediaType(Buffer.from("hello"))).toBeNull();
  });

  it("rejects an extension/type mismatch and an oversized file", () => {
    expect(() =>
      validateUploadMetadata({ fileName: "cv.pdf", contentType: "image/png", byteSize: 10 })
    ).toThrow();
    expect(() =>
      validateUploadMetadata({
        fileName: "cv.pdf",
        contentType: "application/pdf",
        byteSize: 21 * 1024 * 1024
      })
    ).toThrow();
  });

  it("rejects content that does not match the declared type", () => {
    expect(() => assertContentMatchesType(Buffer.from("not a pdf"), "application/pdf")).toThrow();
  });

  it("quarantines malware test files", () => {
    const eicar = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    );
    const verdict = policyScan(eicar, "application/pdf");
    expect(verdict.verdict).toBe("QUARANTINED");
    expect(verdict.reasonCode).toBe("MALWARE_EICAR");
  });

  it("quarantines encrypted and active PDFs before extraction", () => {
    expect(policyScan(pdf("/Encrypt 1 0 R"), "application/pdf").reasonCode).toBe("PDF_ENCRYPTED");
    expect(policyScan(pdf("/JavaScript"), "application/pdf").reasonCode).toBe("PDF_JAVASCRIPT");
    expect(policyScan(pdf("/Launch"), "application/pdf").reasonCode).toBe("PDF_LAUNCH_ACTION");
    expect(policyScan(pdf("/EmbeddedFile"), "application/pdf").reasonCode).toBe(
      "PDF_EMBEDDED_FILE"
    );
    expect(policyScan(pdf("/OpenAction"), "application/pdf").reasonCode).toBe("PDF_OPEN_ACTION");
  });

  it("marks corrupt PDFs and malformed images as needs input", () => {
    expect(policyScan(Buffer.from("%PDF-1.4\nbroken"), "application/pdf").verdict).toBe(
      "NEEDS_INPUT"
    );
    expect(policyScan(Buffer.from("89504e470d0a1a0a", "hex"), "image/png").verdict).toBe(
      "NEEDS_INPUT"
    );
  });

  it("accepts a clean text PDF and clean image", () => {
    expect(policyScan(pdf("clean"), "application/pdf").verdict).toBe("CLEAN");
    expect(
      policyScan(
        Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from([0xff, 0xd9])]),
        "image/jpeg"
      ).verdict
    ).toBe("CLEAN");
    expect(policyScan(Buffer.from("89504e470d0a1a0a0000IEND", "latin1"), "image/png").verdict).toBe(
      "CLEAN"
    );
  });
});
