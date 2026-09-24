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
    options?: {
      name?: string;
      description?: string;
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<{ schemaId: string; version: number; createdAt: string }> {
    validateRequired(schemaId, "schemaId");
    validateRequired(content, "content");

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

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoSchema.Schema | undefined>((resolve, reject) => {
        const request: QueueServiceTypes.GetSchemaRequest = {
          schemaId,
          version: version || 0, // 0 means latest version
        };

        client.getSchema(request, (error, response) => {
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
  async listSchemas(options?: {
    prefix?: string;
    limit?: number;
    activeOnly?: boolean;
  }): Promise<QueueServiceTypes.SchemaInfo[]> {
    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.SchemaInfo[]>((resolve, reject) => {
        const request: QueueServiceTypes.ListSchemasRequest = {
          prefix: options?.prefix || "",
          pageSize: options?.limit ?? 100,
          pageToken: "",
          activeOnly:
            options?.activeOnly !== undefined ? options.activeOnly : false,
        };

        client.listSchemas(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.schemas || []);
          }
        });
      });
    });
  }

  /**
   * Delete a schema version (or all versions if version not specified)
   */
  async deleteSchema(schemaId: string, version?: number): Promise<boolean> {
    validateRequired(schemaId, "schemaId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.DeleteSchemaRequest = {
          schemaId,
          version: version || 0, // 0 means all versions
        };

        client.deleteSchema(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.success || false);
          }
        });
      });
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
    payload: any,
    version?: number,
  ): Promise<{
    valid: boolean;
    errors: ProtoSchema.ValidationError[];
    schemaId: string;
    schemaVersion: number;
  }> {
    validateRequired(schemaId, "schemaId");
    validateRequired(payload, "payload");

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
          version: version || 0,
          payload: payloadString,
        };

        client.validatePayload(request, (error, response) => {
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
