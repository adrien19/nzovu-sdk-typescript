import {
  ListOptions,
  page,
  text,
  integer,
  invalid,
  jsonValue,
} from "../utils/contracts";
import { Schema as ProtoSchema, QueueServiceTypes } from "@nzovu/proto";
import { Connection } from "../connection";
import { handleGrpcError, validateRequired } from "../utils/errors";

/**
 * Schema client for schema management operations
 */
export class SchemaClient {
  constructor(private readonly connection: Connection) {}

  /**
   * Register a new schema (creates a new version automatically)
   */
  async registerSchema(
    schemaId: string,
    content: string,
    options: {
      name: string;
      description?: string;
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<{ schemaId: string; version: number; createdAt: string }> {
    validateRequired(schemaId, "schemaId");
    validateRequired(content, "content");
    text(options?.name, "name");
    text(options.description ?? "", "description", false);
    if (
      options.contentType !== undefined &&
      options.contentType !== "" &&
      options.contentType !== "json-schema"
    )
      invalid("contentType must be json-schema");
    if (options.metadata !== undefined) {
      if (
        !options.metadata ||
        typeof options.metadata !== "object" ||
        Array.isArray(options.metadata)
      )
        invalid("metadata must be a string map");
      for (const value of Object.values(options.metadata))
        text(value, "metadata value", false);
    }

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<{
        schemaId: string;
        version: number;
        createdAt: string;
      }>((resolve, reject) => {
        const request: QueueServiceTypes.RegisterSchemaRequest = {
          schemaId,
          name: options?.name || "",
          description: options?.description || "",
          content,
          contentType: options?.contentType || "json-schema",
          metadata: options?.metadata || {},
        };

        client.registerSchema(request, (error, response) => {
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
          if (error) {
            reject(handleGrpcError(error));
          } else if (response) {
            resolve({
              schemaId: response.schemaId,
              version: response.version,
              createdAt: response.createdAt,
            });
          } else {
            reject(new Error("Empty response from server"));
          }
        });
      });
    });
  }

  /**
   * Get a specific schema version
   */
  async getSchema(
    schemaId: string,
    version?: number,
  ): Promise<ProtoSchema.Schema | undefined> {
    validateRequired(schemaId, "schemaId");
    integer(version ?? 0, "version");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoSchema.Schema | undefined>((resolve, reject) => {
        const request: QueueServiceTypes.GetSchemaRequest = {
          schemaId,
          version: version ?? 0, // 0 means latest version
        };

        client.getSchema(request, (error, response) => {
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.schema);
          }
        });
      });
    });
  }

  /**
   * List all schemas
   */
  async listSchemas(
    options: ListOptions & { activeOnly?: boolean } = {},
  ): Promise<QueueServiceTypes.ListSchemasResponse> {
    const paging = page(options);
    text(options.prefix ?? "", "prefix", false);
    if (
      options.activeOnly !== undefined &&
      typeof options.activeOnly !== "boolean"
    )
      invalid("activeOnly must be boolean");
    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.ListSchemasResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.ListSchemasRequest = {
            prefix: options?.prefix || "",
            ...paging,
            activeOnly:
              options?.activeOnly !== undefined ? options.activeOnly : false,
          };

          client.listSchemas(request, (error, response) => {
            if (!error && response == null) {
              reject(new Error("Empty response from server"));
              return;
            }
            if (error) {
              reject(handleGrpcError(error));
            } else {
              resolve(response);
            }
          });
        },
      );
    });
  }

  /**
   * Delete a schema version (or all versions if version not specified)
   */
  async deleteSchema(
    schemaId: string,
    version?: number,
  ): Promise<QueueServiceTypes.DeleteSchemaResponse> {
    validateRequired(schemaId, "schemaId");
    integer(version ?? 0, "version");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.DeleteSchemaResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.DeleteSchemaRequest = {
            schemaId,
            version: version ?? 0, // 0 means all versions
          };

          client.deleteSchema(request, (error, response) => {
            if (!error && response == null) {
              reject(new Error("Empty response from server"));
              return;
            }
            if (error) {
              reject(handleGrpcError(error));
            } else {
              resolve(response);
            }
          });
        },
      );
    });
  }

  /**
   * Validate a payload against a schema
   *
   * @param schemaId - The schema ID to validate against
   * @param payload - The payload to validate (object or JSON string)
   * @param version - Schema version (0 for latest)
   * @returns Validation result with errors if invalid
   */
  async validatePayload(
    schemaId: string,
    payload: unknown,
    version?: number,
  ): Promise<{
    valid: boolean;
    errors: ProtoSchema.ValidationError[];
    schemaId: string;
    schemaVersion: number;
  }> {
    validateRequired(schemaId, "schemaId");
    integer(version ?? 0, "version");
    if (payload === undefined) invalid("payload is required");
    if (typeof payload !== "string") jsonValue(payload);

    // Convert payload to JSON string if it's an object
    const payloadString =
      typeof payload === "string" ? payload : JSON.stringify(payload);

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<{
        valid: boolean;
        errors: ProtoSchema.ValidationError[];
        schemaId: string;
        schemaVersion: number;
      }>((resolve, reject) => {
        const request: QueueServiceTypes.ValidatePayloadRequest = {
          schemaId,
          version: version ?? 0,
          payload: payloadString,
        };

        client.validatePayload(request, (error, response) => {
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
          if (error) {
            reject(handleGrpcError(error));
          } else if (response) {
            resolve({
              valid: response.valid,
              errors: response.errors,
              schemaId: response.schemaId,
              schemaVersion: response.schemaVersion,
            });
          } else {
            reject(new Error("Empty response from server"));
          }
        });
      });
    });
  }
}
