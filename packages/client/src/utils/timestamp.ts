import { Timestamp } from "@nzovu/proto";
import { invalid, integer } from "./contracts";

export function timestampToISOString(
  value: Timestamp | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value.seconds !== "string" || !/^-?\d+$/.test(value.seconds))
    invalid("timestamp seconds must be an integer string");
  const seconds = BigInt(value.seconds);
  if (seconds < -62135596800n || seconds > 253402300799n)
    invalid("timestamp is outside protobuf range");
  integer(value.nanos, "timestamp nanos", 0, 999999999);
  const date = new Date(Number(seconds * 1000n)).toISOString();
  return date.replace(".000Z", `.${String(value.nanos).padStart(9, "0")}Z`);
}
