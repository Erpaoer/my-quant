import type { Response } from "express";

export type OperationalDataErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SOURCE"
  | "INVALID_API_TYPE"
  | "LEGACY_ENDPOINT_DEPRECATED"
  | "SOURCE_NOT_IMPLEMENTED"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_AUTH_FAILED"
  | "SOURCE_RATE_LIMITED"
  | "NO_DATA"
  | "INTERNAL_ERROR";

interface ErrorDetails {
  source?: string;
  retryable?: boolean;
  upstreamStatus?: number;
  successor?: string;
  success?: never;
  code?: never;
  message?: never;
  data?: never;
}

interface ClassifiedFailure {
  status: number;
  code: "SOURCE_UNREACHABLE" | "SOURCE_AUTH_FAILED" | "SOURCE_RATE_LIMITED";
  retryable: boolean;
  upstreamStatus?: number;
}

function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

export function classifyUpstreamFailure(error: unknown): ClassifiedFailure {
  const status = upstreamStatus(error);
  if (status === 401 || status === 403) {
    return {
      status: 503,
      code: "SOURCE_AUTH_FAILED",
      retryable: false,
      upstreamStatus: status,
    };
  }
  if (status === 429) {
    return {
      status: 503,
      code: "SOURCE_RATE_LIMITED",
      retryable: true,
      upstreamStatus: status,
    };
  }
  return {
    status: 502,
    code: "SOURCE_UNREACHABLE",
    retryable: true,
    ...(status === undefined ? {} : { upstreamStatus: status }),
  };
}

export function sendOperationalDataError(
  res: Response,
  status: number,
  code: OperationalDataErrorCode,
  message: string,
  details: ErrorDetails = {},
) {
  return res.status(status).json({
    ...(details.source === undefined ? {} : { source: details.source }),
    ...(details.retryable === undefined
      ? {}
      : { retryable: details.retryable }),
    ...(details.upstreamStatus === undefined
      ? {}
      : { upstreamStatus: details.upstreamStatus }),
    ...(details.successor === undefined
      ? {}
      : { successor: details.successor }),
    success: false,
    code,
    message,
  });
}

export function sendUpstreamDataError(
  res: Response,
  source: string,
  error: unknown,
  message: string,
) {
  const failure = classifyUpstreamFailure(error);
  return sendOperationalDataError(res, failure.status, failure.code, message, {
    source,
    retryable: failure.retryable,
    ...(failure.upstreamStatus === undefined
      ? {}
      : { upstreamStatus: failure.upstreamStatus }),
  });
}
