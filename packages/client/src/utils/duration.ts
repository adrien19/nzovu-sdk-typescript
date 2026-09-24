import { Duration } from "@nzovu/proto";
import { duration as validateDuration, invalid } from "./contracts";

const NANOS = 1000000000n;

export function parseDuration(value: string): Duration {
  const match =
    typeof value === "string" &&
    /^(\d+)(?:\.(\d{1,9}))?(ns|us|ms|s|m|h)$/.exec(value);
  if (!match) invalid(`Invalid duration format: ${value}`);
  const units: Record<string, bigint> = {
    ns: 1n,
    us: 1000n,
    ms: 1000000n,
    s: NANOS,
    m: 60n * NANOS,
    h: 3600n * NANOS,
  };
  const scale = 10n ** BigInt(match[2]?.length ?? 0);
  const numerator =
    (BigInt(match[1]) * scale + BigInt(match[2] ?? "0")) * units[match[3]];
  if (numerator % scale !== 0n)
    invalid("duration has sub-nanosecond precision");
  const nanos = numerator / scale;
  const result = {
    seconds: (nanos / NANOS).toString(),
    nanos: Number(nanos % NANOS),
  };
  validateDuration(result, "duration");
  return result;
}

export function durationToMs(value: Duration): number {
  validateDuration(value, "duration");
  const millis =
    BigInt(value.seconds) * 1000n + BigInt(Math.floor(value.nanos / 1000000));
  if (millis > BigInt(Number.MAX_SAFE_INTEGER))
    invalid("duration cannot be represented safely as milliseconds");
  return Number(millis);
}

export function msToDuration(ms: number): Duration {
  if (!Number.isSafeInteger(ms) || ms < 0)
    invalid("milliseconds must be a non-negative safe integer");
  const result = {
    seconds: (BigInt(ms) / 1000n).toString(),
    nanos: Number(BigInt(ms) % 1000n) * 1000000,
  };
  validateDuration(result, "duration");
  return result;
}
