import * as grpc from "@grpc/grpc-js";
import { NzovuError, ErrorCode } from "../types";

/**
 * Convert gRPC status code to Nzovu error code
 */
export function grpcStatusToErrorCode(status: grpc.status): ErrorCode {
  switch (status) {
    case grpc.status.INVALID_ARGUMENT:
      return ErrorCode.INVALID_ARGUMENT;
    case grpc.status.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case grpc.status.ALREADY_EXISTS:
      return ErrorCode.ALREADY_EXISTS;
    case grpc.status.PERMISSION_DENIED:
    case grpc.status.UNAUTHENTICATED:
      return ErrorCode.PERMISSION_DENIED;
    case grpc.status.RESOURCE_EXHAUSTED:
      return ErrorCode.RESOURCE_EXHAUSTED;
    case grpc.status.UNAVAILABLE:
      return ErrorCode.UNAVAILABLE;
    case grpc.status.DEADLINE_EXCEEDED:
      return ErrorCode.DEADLINE_EXCEEDED;
    case grpc.status.INTERNAL:
    case grpc.status.DATA_LOSS:
    case grpc.status.UNKNOWN:
    default:
      return ErrorCode.INTERNAL;
  }
}

/**
 * Create NzovuError from gRPC error
 */
export function handleGrpcError(error: Error): NzovuError {
  if (error instanceof NzovuError) {
    return error;
  }

  const grpcError = error as grpc.ServiceError;

  if (grpcError.code !== undefined) {
    const code = grpcStatusToErrorCode(grpcError.code);
    return new NzovuError(code, grpcError.details || grpcError.message, error);
  }

  return new NzovuError(ErrorCode.INTERNAL, error.message, error);
}

/**
 * Validate required field
 */
export function validateRequired(value: any, fieldName: string): void {
  if (value === undefined || value === null || value === "") {
    throw new NzovuError(
      ErrorCode.INVALID_ARGUMENT,
      `${fieldName} is required`,
    );
  }
}

/**
 * Validate positive number
 */
export function validatePositive(
  value: number | undefined,
  fieldName: string,
): void {
  if (value !== undefined && value <= 0) {
    throw new NzovuError(
      ErrorCode.INVALID_ARGUMENT,
      `${fieldName} must be positive`,
    );
  }
}

/**
 * Validate non-negative number
 */
export function validateNonNegative(
  value: number | undefined,
  fieldName: string,
): void {
  if (value !== undefined && value < 0) {
    throw new NzovuError(
      ErrorCode.INVALID_ARGUMENT,
      `${fieldName} must be non-negative`,
    );
  }
}

/**
 * Validate range
 */
export function validateRange(
  value: number | undefined,
  min: number,
  max: number,
  fieldName: string,
): void {
  if (value !== undefined && (value < min || value > max)) {
    throw new NzovuError(
      ErrorCode.INVALID_ARGUMENT,
      `${fieldName} must be between ${min} and ${max}`,
    );
  }
}
