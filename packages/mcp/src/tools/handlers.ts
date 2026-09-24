import { NzovuClient } from '@nzovu/client';
import { definitions } from './index.js';
import { ToolName, validateToolInput } from './validation.js';

export function jsonResult(value: unknown): any {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) return value.map(jsonResult);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, jsonResult(item)])
    );
  return value;
}
export async function handleToolCall(
  name: string,
  input: unknown,
  client: NzovuClient
): Promise<Record<string, unknown>> {
  if (!Object.hasOwn(definitions, name)) throw new Error('Unknown tool');
  const args = validateToolInput(name as ToolName, input);
  return jsonResult(await definitions[name as ToolName].execute(client, args));
}
