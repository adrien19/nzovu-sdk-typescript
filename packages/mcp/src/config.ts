import { parseDuration as duration, durationToMs } from '@nzovu/client';

export interface ServerConfig {
  nzovuAddress: string;
  insecure: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  apiKey?: string;
  timeoutMs: number;
  maxManagedClaims: number;
}
export function parseDuration(value: string): number {
  const parsed = duration(value);
  if (parsed.nanos % 1000000 !== 0) throw new Error('Timeout requires whole milliseconds');
  const ms = durationToMs(parsed);
  if (ms < 1 || ms > 2147483647) throw new Error('Timeout out of range');
  return ms;
}
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  if (env.NZOVU_INSECURE !== undefined && !['true', 'false'].includes(env.NZOVU_INSECURE))
    throw new Error('NZOVU_INSECURE must be true or false');
  const insecure = env.NZOVU_INSECURE === 'true';
  const certPath = env.NZOVU_CERT_PATH,
    keyPath = env.NZOVU_KEY_PATH,
    caPath = env.NZOVU_CA_PATH;
  for (const value of [certPath, keyPath, caPath])
    if (value !== undefined && !value.trim()) throw new Error('TLS paths must be nonempty');
  if (Boolean(certPath) !== Boolean(keyPath))
    throw new Error('Certificate and key paths must be supplied together');
  if (insecure && (certPath || keyPath || caPath))
    throw new Error('Plaintext cannot use TLS paths');
  const apiKey = env.NZOVU_API_KEY;
  if (apiKey !== undefined && !/^[\x21-\x7e]+$/.test(apiKey))
    throw new Error('NZOVU_API_KEY must be nonempty printable ASCII');
  const nzovuAddress = env.NZOVU_ADDRESS ?? 'localhost:9000';
  if (!nzovuAddress.trim()) throw new Error('NZOVU_ADDRESS must be nonempty');
  const bound = env.NZOVU_MAX_MANAGED_CLAIMS ?? '1000';
  if (!/^\d+$/.test(bound) || Number(bound) < 1 || Number(bound) > 2147483647)
    throw new Error('NZOVU_MAX_MANAGED_CLAIMS must be a positive int32');
  return {
    nzovuAddress,
    insecure,
    certPath,
    keyPath,
    caPath,
    apiKey,
    timeoutMs: parseDuration(env.NZOVU_TIMEOUT ?? '30s'),
    maxManagedClaims: Number(bound),
  };
}
