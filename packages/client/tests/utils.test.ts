import * as grpc from "@grpc/grpc-js";
import { NzovuError, ErrorCode } from "../src/types";
import {
  durationToMs,
  msToDuration,
  parseDuration,
} from "../src/utils/duration";
import {
  grpcStatusToErrorCode,
  handleGrpcError,
  validateNonNegative,
  validatePositive,
  validateRange,
  validateRequired,
} from "../src/utils/errors";
import {
  calculateBackoff,
  isRetryableError,
  RetryConfig,
  retryOperation,
  sleep,
} from "../src/utils/retry";

describe("Duration Utils", () => {
  describe("parseDuration", () => {
    it("should parse milliseconds", () => {
      const result = parseDuration("1500ms");
      expect(result.seconds).toBe("1");
      expect(result.nanos).toBe(500000000);
    });

    it("should parse seconds", () => {
      const result = parseDuration("30s");
      expect(result.seconds).toBe("30");
      expect(result.nanos).toBe(0);
    });

    it("should parse minutes", () => {
      const result = parseDuration("5m");
      expect(result.seconds).toBe("300");
      expect(result.nanos).toBe(0);
    });

    it("should parse hours", () => {
      const result = parseDuration("2h");
      expect(result.seconds).toBe("7200");
      expect(result.nanos).toBe(0);
    });

    it("should handle milliseconds less than 1 second", () => {
      const result = parseDuration("500ms");
      expect(result.seconds).toBe("0");
      expect(result.nanos).toBe(500000000);
    });

    it("should throw error for invalid format", () => {
      expect(() => parseDuration("invalid")).toThrow("Invalid duration format");
    });

    it("should throw error for unsupported unit", () => {
      // This test covers the default case in switch (unreachable in practice)
      // The regex already restricts to ms|s|m|h, so this is defensive
      expect(() => parseDuration("10d")).toThrow("Invalid duration format");
    });
  });

  describe("durationToMs", () => {
    it("should convert seconds to milliseconds", () => {
      const result = durationToMs({ seconds: "30", nanos: 0 });
      expect(result).toBe(30000);
    });

    it("should convert seconds and nanos to milliseconds", () => {
      const result = durationToMs({ seconds: "1", nanos: 500000000 });
      expect(result).toBe(1500);
    });

    it("should handle zero duration", () => {
      const result = durationToMs({ seconds: "0", nanos: 0 });
      expect(result).toBe(0);
    });

    it("should handle undefined nanos", () => {
      expect(() =>
        durationToMs({ seconds: "10", nanos: undefined as any }),
      ).toThrow();
    });
  });

  describe("msToDuration", () => {
    it("should convert milliseconds to duration", () => {
      const result = msToDuration(1500);
      expect(result.seconds).toBe("1");
      expect(result.nanos).toBe(500000000);
    });

    it("should handle exact seconds", () => {
      const result = msToDuration(5000);
      expect(result.seconds).toBe("5");
      expect(result.nanos).toBe(0);
    });

    it("should handle zero milliseconds", () => {
      const result = msToDuration(0);
      expect(result.seconds).toBe("0");
      expect(result.nanos).toBe(0);
    });
  });
});

describe("Error Utils", () => {
  describe("grpcStatusToErrorCode", () => {
    it("should map INVALID_ARGUMENT", () => {
      expect(grpcStatusToErrorCode(grpc.status.INVALID_ARGUMENT)).toBe(
        ErrorCode.INVALID_ARGUMENT,
      );
    });

    it("should map NOT_FOUND", () => {
      expect(grpcStatusToErrorCode(grpc.status.NOT_FOUND)).toBe(
        ErrorCode.NOT_FOUND,
      );
    });

    it("should map ALREADY_EXISTS", () => {
      expect(grpcStatusToErrorCode(grpc.status.ALREADY_EXISTS)).toBe(
        ErrorCode.ALREADY_EXISTS,
      );
    });

    it("should map PERMISSION_DENIED", () => {
      expect(grpcStatusToErrorCode(grpc.status.PERMISSION_DENIED)).toBe(
        ErrorCode.PERMISSION_DENIED,
      );
    });

    it("should map UNAUTHENTICATED to PERMISSION_DENIED", () => {
      expect(grpcStatusToErrorCode(grpc.status.UNAUTHENTICATED)).toBe(
        ErrorCode.PERMISSION_DENIED,
      );
    });

    it("should map RESOURCE_EXHAUSTED", () => {
      expect(grpcStatusToErrorCode(grpc.status.RESOURCE_EXHAUSTED)).toBe(
        ErrorCode.RESOURCE_EXHAUSTED,
      );
    });

    it("should map UNAVAILABLE", () => {
      expect(grpcStatusToErrorCode(grpc.status.UNAVAILABLE)).toBe(
        ErrorCode.UNAVAILABLE,
      );
    });

    it("should map DEADLINE_EXCEEDED", () => {
      expect(grpcStatusToErrorCode(grpc.status.DEADLINE_EXCEEDED)).toBe(
        ErrorCode.DEADLINE_EXCEEDED,
      );
    });

    it("should map INTERNAL", () => {
      expect(grpcStatusToErrorCode(grpc.status.INTERNAL)).toBe(
        ErrorCode.INTERNAL,
      );
    });

    it("should map DATA_LOSS to INTERNAL", () => {
      expect(grpcStatusToErrorCode(grpc.status.DATA_LOSS)).toBe(
        ErrorCode.INTERNAL,
      );
    });

    it("should map UNKNOWN to INTERNAL", () => {
      expect(grpcStatusToErrorCode(grpc.status.UNKNOWN)).toBe(
        ErrorCode.INTERNAL,
      );
    });

    it("should map unknown status to INTERNAL", () => {
      expect(grpcStatusToErrorCode(999 as grpc.status)).toBe(
        ErrorCode.INTERNAL,
      );
    });
  });

  describe("handleGrpcError", () => {
    it("should return NzovuError as-is", () => {
      const original = new NzovuError(ErrorCode.NOT_FOUND, "Not found");
      const result = handleGrpcError(original);
      expect(result).toBe(original);
    });

    it("should convert gRPC error with code", () => {
      const grpcError = Object.assign(new Error("gRPC error"), {
        code: grpc.status.NOT_FOUND,
        details: "Resource not found",
      });
      const result = handleGrpcError(grpcError);
      expect(result).toBeInstanceOf(NzovuError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe("Resource not found");
    });

    it("should use message when details is not available", () => {
      const grpcError = Object.assign(new Error("Some error message"), {
        code: grpc.status.INTERNAL,
      });
      const result = handleGrpcError(grpcError);
      expect(result.message).toBe("Some error message");
    });

    it("should handle non-gRPC error", () => {
      const error = new Error("Regular error");
      const result = handleGrpcError(error);
      expect(result.code).toBe(ErrorCode.INTERNAL);
      expect(result.message).toBe("Regular error");
    });
  });

  describe("validateRequired", () => {
    it("should not throw for valid value", () => {
      expect(() => validateRequired("value", "field")).not.toThrow();
    });

    it("should throw for undefined", () => {
      expect(() => validateRequired(undefined, "field")).toThrow(
        "field is required",
      );
    });

    it("should throw for null", () => {
      expect(() => validateRequired(null, "field")).toThrow(
        "field is required",
      );
    });

    it("should throw for empty string", () => {
      expect(() => validateRequired("", "field")).toThrow("field is required");
    });
  });

  describe("validatePositive", () => {
    it("should not throw for positive number", () => {
      expect(() => validatePositive(5, "field")).not.toThrow();
    });

    it("should not throw for undefined", () => {
      expect(() => validatePositive(undefined, "field")).not.toThrow();
    });

    it("should throw for zero", () => {
      expect(() => validatePositive(0, "field")).toThrow(
        "field must be positive",
      );
    });

    it("should throw for negative number", () => {
      expect(() => validatePositive(-1, "field")).toThrow(
        "field must be positive",
      );
    });
  });

  describe("validateNonNegative", () => {
    it("should not throw for positive number", () => {
      expect(() => validateNonNegative(5, "field")).not.toThrow();
    });

    it("should not throw for zero", () => {
      expect(() => validateNonNegative(0, "field")).not.toThrow();
    });

    it("should not throw for undefined", () => {
      expect(() => validateNonNegative(undefined, "field")).not.toThrow();
    });

    it("should throw for negative number", () => {
      expect(() => validateNonNegative(-1, "field")).toThrow(
        "field must be non-negative",
      );
    });
  });

  describe("validateRange", () => {
    it("should not throw for value in range", () => {
      expect(() => validateRange(5, 1, 10, "field")).not.toThrow();
    });

    it("should not throw for value at min", () => {
      expect(() => validateRange(1, 1, 10, "field")).not.toThrow();
    });

    it("should not throw for value at max", () => {
      expect(() => validateRange(10, 1, 10, "field")).not.toThrow();
    });

    it("should not throw for undefined", () => {
      expect(() => validateRange(undefined, 1, 10, "field")).not.toThrow();
    });

    it("should throw for value below min", () => {
      expect(() => validateRange(0, 1, 10, "field")).toThrow(
        "field must be between 1 and 10",
      );
    });

    it("should throw for value above max", () => {
      expect(() => validateRange(11, 1, 10, "field")).toThrow(
        "field must be between 1 and 10",
      );
    });
  });
});

describe("Retry Utils", () => {
  describe("isRetryableError", () => {
    it("should return true for NzovuError with UNAVAILABLE", () => {
      const error = new NzovuError(ErrorCode.UNAVAILABLE, "Unavailable");
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return true for NzovuError with DEADLINE_EXCEEDED", () => {
      const error = new NzovuError(ErrorCode.DEADLINE_EXCEEDED, "Timeout");
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return true for NzovuError with INTERNAL", () => {
      const error = new NzovuError(ErrorCode.INTERNAL, "Internal error");
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return true for NzovuError with RESOURCE_EXHAUSTED", () => {
      const error = new NzovuError(
        ErrorCode.RESOURCE_EXHAUSTED,
        "Rate limited",
      );
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return false for NzovuError with NOT_FOUND", () => {
      const error = new NzovuError(ErrorCode.NOT_FOUND, "Not found");
      expect(isRetryableError(error)).toBe(false);
    });

    it("should return true for gRPC UNAVAILABLE error", () => {
      const error = Object.assign(new Error("gRPC error"), {
        code: grpc.status.UNAVAILABLE,
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return true for gRPC DEADLINE_EXCEEDED error", () => {
      const error = Object.assign(new Error("gRPC error"), {
        code: grpc.status.DEADLINE_EXCEEDED,
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return true for gRPC INTERNAL error", () => {
      const error = Object.assign(new Error("gRPC error"), {
        code: grpc.status.INTERNAL,
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return true for gRPC RESOURCE_EXHAUSTED error", () => {
      const error = Object.assign(new Error("gRPC error"), {
        code: grpc.status.RESOURCE_EXHAUSTED,
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it("should return false for gRPC NOT_FOUND error", () => {
      const error = Object.assign(new Error("gRPC error"), {
        code: grpc.status.NOT_FOUND,
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it("should return false for regular error without code", () => {
      const error = new Error("Regular error");
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe("calculateBackoff", () => {
    const config: RetryConfig = {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
    };

    beforeEach(() => {
      // Mock Math.random for deterministic tests
      jest.spyOn(Math, "random").mockReturnValue(0.5);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should calculate exponential backoff with jitter", () => {
      // attempt 0: 100 * 2^0 + 0.5 * 100 = 100 + 50 = 150
      expect(calculateBackoff(0, config)).toBe(150);
    });

    it("should increase delay with each attempt", () => {
      // attempt 1: 100 * 2^1 + 0.5 * 100 = 200 + 50 = 250
      expect(calculateBackoff(1, config)).toBe(250);
    });

    it("should respect maxDelay", () => {
      // attempt 10: 100 * 2^10 = 102400, capped to 5000
      expect(calculateBackoff(10, config)).toBe(5000);
    });

    it("should work without maxDelay", () => {
      const configNoMax: RetryConfig = {
        maxRetries: 3,
        baseDelay: 100,
      };
      // attempt 5: 100 * 2^5 + 0.5 * 100 = 3200 + 50 = 3250
      expect(calculateBackoff(5, configNoMax)).toBe(3250);
    });
  });

  describe("sleep", () => {
    it("should sleep for specified duration", async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some timing variance
    });
  });

  describe("retryOperation", () => {
    const config: RetryConfig = {
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 100,
    };

    it("should succeed on first attempt", async () => {
      const operation = jest.fn().mockResolvedValue("success");
      const result = await retryOperation(operation, config);
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable error and succeed", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(
          new NzovuError(ErrorCode.UNAVAILABLE, "Retry me"),
        )
        .mockResolvedValue("success");

      const result = await retryOperation(operation, config);
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should throw immediately on non-retryable error", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new NzovuError(ErrorCode.NOT_FOUND, "Not found"));

      await expect(retryOperation(operation, config)).rejects.toThrow(
        "Not found",
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should throw after max retries", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(
          new NzovuError(ErrorCode.UNAVAILABLE, "Always fail"),
        );

      await expect(retryOperation(operation, config)).rejects.toThrow(
        "Always fail",
      );
      // Initial attempt + 3 retries = 4 total
      expect(operation).toHaveBeenCalledTimes(4);
    });
  });
});
