import * as grpc from "@grpc/grpc-js";
import { NzovuError, ErrorCode } from "../types";

/**
 * Convert gRPC status code to Nzovu error code
 */
export function grpcStatusToErrorCode(status: grpc.status): ErrorCode {
  const name = grpc.status[status] as keyof typeof ErrorCode;
  return ErrorCode[name] ?? ErrorCode.UNKNOWN;
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
    return new NzovuError(
      code,
      grpcError.details ?? grpcError.message,
      error,
      grpcError.code,
      grpcError.details,
      grpcError.metadata?.clone(),
    );
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
