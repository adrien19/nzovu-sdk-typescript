import {
  Duration,
  Message,
  LeasePolicy,
  Schedule,
  Payload,
} from "@nzovu/proto";
import { ErrorCode, NzovuError } from "../types";

export interface PageOptions {
  pageSize?: number;
  pageToken?: string;
}
export interface ListOptions extends PageOptions {
  prefix?: string;
}

export function invalid(message: string): never {
  throw new NzovuError(ErrorCode.INVALID_ARGUMENT, message);
}
export function integer(
  value: number,
  field: string,
  min = 0,
  max = 2147483647,
): void {
  if (!Number.isInteger(value) || value < min || value > max)
    invalid(`${field} must be an integer between ${min} and ${max}`);
}
export function text(
  value: unknown,
  field: string,
  required = true,
): asserts value is string {
  if (typeof value !== "string" || (required && !value.trim()))
    invalid(`${field} must be ${required ? "a non-empty" : "a"} string`);
}
export function page(options: PageOptions = {}): {
  pageSize: number;
  pageToken: string;
} {
  if (!options || typeof options !== "object" || Array.isArray(options))
    invalid("pagination options must be an object");
  const pageSize = options.pageSize ?? 0;
  const pageToken = options.pageToken ?? "";
  integer(pageSize, "pageSize", 0, 1000);
  text(pageToken, "pageToken", false);
  return { pageSize, pageToken };
}
export function priority(value: string): void {
  if (typeof value !== "string" || !/^[0-4]$/.test(value))
    invalid("priority must be an int64 string from 0 to 4");
}
export function duration(value: Duration | undefined, field: string): void {
  if (value === undefined) return;
  if (
    !value ||
    typeof value.seconds !== "string" ||
    !/^\d+$/.test(value.seconds)
  )
    invalid(`${field}.seconds must be a non-negative integer string`);
  if (BigInt(value.seconds) > 315576000000n)
    invalid(`${field}.seconds exceeds protobuf duration range`);
  integer(value.nanos, `${field}.nanos`, 0, 999999999);
}
export function leasePolicy(value: LeasePolicy | undefined): void {
  if (value === undefined) return;
  for (const key of [
    "baseLease",
    "maxExtension",
    "heartbeatTimeout",
    "extendStep",
  ] as const)
    duration(value[key], key);
  if (value.maxRenewals !== undefined)
    integer(value.maxRenewals, "maxRenewals");
}
export function headers(values: Message.Message_Metadata_Header[]): void {
  if (!Array.isArray(values)) invalid("headers must be an array");
  let total = 0;
  for (const header of values) {
    if (
      !header ||
      typeof header.key !== "string" ||
      !/^[a-z0-9-]+$/.test(header.key) ||
      /^(x-nzovu-|x-internal-|x-system-)/.test(header.key)
    )
      invalid("invalid or reserved header key");
    if (!(header.value instanceof Uint8Array) || header.value.byteLength > 4096)
      invalid("header value must be bytes, at most 4096 bytes");
    total += Buffer.byteLength(header.key) + header.value.byteLength;
  }
  if (total > 32768) invalid("headers exceed 32768 bytes");
}
export function message(value: Message.Message): void {
  if (
    !value ||
    typeof value.messageId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,256}$/.test(value.messageId)
  )
    invalid("invalid messageId");
  const metadata = value.metadata;
  if (!metadata) invalid("message metadata is required");
  priority(metadata.priority);
  headers(metadata.headers);
  duration(metadata.leaseDuration, "leaseDuration");
  leasePolicy(metadata.leasePolicy);
  payload(metadata.payload);
  if (
    metadata.state !== Message.Message_Metadata_State.INVISIBLE ||
    metadata.leaseExpiry !== "0" ||
    metadata.leaseRenewalCount !== 0 ||
    metadata.currentAttempt !== undefined ||
    metadata.priorityLevel !== 0
  )
    invalid("message runtime fields are managed by the server");
}
export function schedule(value: Schedule.Schedule): void {
  if (!value) invalid("schedule is required");
  text(value.scheduleId, "scheduleId");
  if (!value.metadata) invalid("schedule metadata is required");
  if ("exclusivityKey" in value.metadata)
    invalid("schedule exclusivityKey is not supported");
  priority(value.metadata.priority);
  headers(value.metadata.headers);
  text(value.metadata.queueName, "queueName");
  duration(value.metadata.leaseDuration, "leaseDuration");
  payload(value.metadata.payload);
}

export function jsonValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null)
    invalid("payload must contain JSON values only");
  if (seen.has(value)) invalid("payload must not contain cycles");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    invalid("payload objects must be plain JSON objects");
  seen.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value))
    jsonValue(item, seen);
  seen.delete(value);
}

function payload(value: Payload | undefined): void {
  if (value === undefined) return;
  integer(value.schemaVersion, "schemaVersion");
  text(value.schemaId, "schemaId", false);
  if (value.data !== undefined) {
    if (
      !value.data ||
      typeof value.data !== "object" ||
      Array.isArray(value.data)
    )
      invalid("payload data must be a JSON object");
    jsonValue(value.data);
  }
}
