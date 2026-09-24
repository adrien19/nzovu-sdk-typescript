/**
 * Configuration management for Nzovu MCP Server
 */

import { parseDuration as clientParseDuration, durationToMs } from '@nzovu/client';

export interface ServerConfig {
  nzovuAddress: string;
  insecure: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  timeout: string;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  return {
    nzovuAddress: process.env.NZOVU_ADDRESS || 'localhost:9000',
    insecure: process.env.NZOVU_INSECURE !== 'false',
    certPath: process.env.NZOVU_CERT_PATH,
    keyPath: process.env.NZOVU_KEY_PATH,
    caPath: process.env.NZOVU_CA_PATH,
    timeout: process.env.NZOVU_TIMEOUT || '30s',
  };
}

/**
 * Parse duration string to milliseconds
 *
 * Uses the client's parseDuration for consistency, then converts to ms.
 * Supports formats: "30s", "5m", "1h", "100ms"
 */
export function parseDuration(duration: string): number {
  const durationObj = clientParseDuration(duration);
  return durationToMs(durationObj);
}
