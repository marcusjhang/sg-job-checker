export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CSRF_FAILED"
  | "RATE_LIMITED"
  | "DOMAIN_STATE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "POLICY_NOT_ACCEPTED"
  | "OUT_OF_SCOPE"
  | "UPLOAD_INVALID"
  | "DOCUMENT_UNSAFE"
  | "EXTRACTION_FAILED"
  | "SOURCE_UNAVAILABLE"
  | "RULE_UNAVAILABLE"
  | "GENERATION_FAILED"
  | "INTERNAL";

export type FieldError = { field: string; message: string };

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fieldErrors?: FieldError[];
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options: {
      retryable?: boolean;
      fieldErrors?: FieldError[];
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? false;
    if (options.fieldErrors) this.fieldErrors = options.fieldErrors;
    if (options.details) this.details = options.details;
  }
}

export const notFound = (): AppError =>
  new AppError("NOT_FOUND", 404, "The requested resource was not found.");

export const unauthenticated = (): AppError =>
  new AppError("UNAUTHENTICATED", 401, "Sign in to continue.");

export const conflict = (message: string, code: ErrorCode = "DOMAIN_STATE_CONFLICT"): AppError =>
  new AppError(code, 409, message);

export const validationFailed = (fieldErrors: FieldError[]): AppError =>
  new AppError("VALIDATION_FAILED", 422, "Some fields need attention.", { fieldErrors });

export function errorBody(error: AppError, correlationId: string) {
  return {
    code: error.code,
    message: error.message,
    correlationId,
    retryable: error.retryable,
    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
  };
}
