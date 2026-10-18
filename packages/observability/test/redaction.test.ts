import { describe, expect, it } from "vitest";
import { sanitize, bytesBucket, errorCodeOf } from "@job-checker/observability";
import { logger } from "@job-checker/observability";
import { AppError } from "@job-checker/contracts";

describe("telemetry allowlist", () => {
  it("drops sensitive and unknown fields", () => {
    const sanitized = sanitize({
      event: "document.scan",
      documentIdHash: "abc",
      salary: 6000,
      fileName: "offer.pdf",
      documentText: "confidential",
      prompt: "ignore previous instructions",
      signedUrl: "https://example.com/secret",
      errorCode: "SCAN_FAILED",
      bytesBucket: "<1MB"
    });
    expect(sanitized).toEqual({
      event: "document.scan",
      documentIdHash: "abc",
      errorCode: "SCAN_FAILED",
      bytesBucket: "<1MB"
    });
    expect(JSON.stringify(sanitized)).not.toContain("offer.pdf");
    expect(JSON.stringify(sanitized)).not.toContain("6000");
  });

  it("filters object values and truncates strings", () => {
    const sanitized = sanitize({ event: "x", outcome: { salary: 1 }, state: "a".repeat(500) });
    expect(sanitized.outcome).toBe("[filtered]");
    expect(String(sanitized.state).length).toBe(200);
  });

  it("buckets sizes and normalizes error codes", () => {
    expect(bytesBucket(500)).toBe("<64KB");
    expect(bytesBucket(21 * 1024 * 1024)).toBe(">=20MB");
    expect(errorCodeOf(new AppError("NOT_FOUND", 404, "x"))).toBe("NOT_FOUND");
    expect(errorCodeOf(new Error("sensitive message"))).toBe("INTERNAL");
  });

  it("never prints sensitive values through the logger", () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      logger.info({
        event: "test",
        salary: 6000,
        fileName: "secret-offer.pdf",
        documentText: "NRIC S1234567D",
        errorCode: "TEST"
      });
    } finally {
      process.stdout.write = original;
    }
    const output = lines.join("");
    expect(output).not.toContain("secret-offer.pdf");
    expect(output).not.toContain("S1234567D");
    expect(output).not.toContain("6000");
  });
});
