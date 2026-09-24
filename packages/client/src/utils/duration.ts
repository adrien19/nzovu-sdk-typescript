import { Duration } from "@nzovu/proto";

/**
 * Parse duration string (e.g., "30s", "5m", "1h") to Duration object
 */
export function parseDuration(duration: string): Duration {
  const match = duration.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) {
    throw new Error(
      `Invalid duration format: ${duration}. Expected format: <number><unit> (e.g., "30s", "5m", "1h")`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let seconds: number = 0;
  let nanos: number = 0;
  switch (unit) {
    case "ms":
      seconds = Math.floor(value / 1000);
      nanos = (value % 1000) * 1000000;
      break;
    case "s":
      seconds = value;
      break;
    case "m":
      seconds = value * 60;
      break;
    case "h":
      seconds = value * 60 * 60;
      break;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }

  return {
    seconds: seconds.toString(),
    nanos,
  };
}

/**
 * Convert Duration to milliseconds
 */
export function durationToMs(duration: Duration): number {
  const seconds = parseInt(duration.seconds, 10);
  const nanos = duration.nanos || 0;
  return seconds * 1000 + Math.floor(nanos / 1000000);
}

/**
 * Convert milliseconds to Duration
 */
export function msToDuration(ms: number): Duration {
  const seconds = Math.floor(ms / 1000);
  const nanos = (ms % 1000) * 1000000;
  return {
    seconds: seconds.toString(),
    nanos,
  };
}
