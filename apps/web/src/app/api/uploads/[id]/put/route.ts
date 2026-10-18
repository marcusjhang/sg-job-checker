import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@job-checker/db";
import { putUploadObject } from "@job-checker/documents";
import { AppError } from "@job-checker/contracts";
import { errorResponse, jsonResponse } from "@/lib/api";
import { env } from "@job-checker/observability/env";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const correlationId = randomUUID();
  try {
    const { id } = await context.params;
    const token =
      request.headers.get("x-upload-token") ?? request.nextUrl.searchParams.get("token");
    if (!token) throw new AppError("UPLOAD_INVALID", 422, "The upload token is missing.");
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 20 * 1024 * 1024 + 1) {
      throw new AppError("UPLOAD_INVALID", 413, "The file exceeds the 20 MB limit.");
    }
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > env().MAX_UPLOAD_BYTES) {
      throw new AppError("UPLOAD_INVALID", 413, "The file exceeds the 20 MB limit.");
    }
    const result = await putUploadObject(getDb(), id, token, bytes);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error, correlationId, "uploads.put");
  }
}
