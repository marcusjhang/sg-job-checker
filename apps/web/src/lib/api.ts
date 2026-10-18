import { NextResponse } from "next/server";
import { AppError, errorBody } from "@job-checker/contracts";
import { errorCodeOf, logger } from "@job-checker/observability";

export function errorResponse(error: unknown, correlationId: string, route?: string): Response {
  if (error instanceof AppError) {
    logger.warn({
      event: "api.error",
      correlationId,
      errorCode: error.code,
      retryable: error.retryable,
      route
    });
    return NextResponse.json(errorBody(error, correlationId), { status: error.status });
  }
  logger.error({ event: "api.unhandled", correlationId, errorCode: errorCodeOf(error), route });
  return NextResponse.json(
    {
      code: "INTERNAL",
      message: "Something went wrong. Try again.",
      correlationId,
      retryable: true
    },
    { status: 500 }
  );
}

export function jsonResponse(data: unknown, status = 200): Response {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" }
  });
}
