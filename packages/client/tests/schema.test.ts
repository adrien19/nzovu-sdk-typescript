import { QueueServiceTypes } from "@nzovu/proto";
import { Connection } from "../src/connection";
import { SchemaClient } from "../src/schema";

describe("SchemaClient", () => {
  let schemaClient: SchemaClient;
  let mockConnection: jest.Mocked<Connection>;
  let mockQueueServiceClient: any;

  beforeEach(() => {
    mockQueueServiceClient = {
      registerSchema: jest.fn(),
      getSchema: jest.fn(),
      listSchemas: jest.fn(),
      deleteSchema: jest.fn(),
      validatePayload: jest.fn(),
    };

    mockConnection = {
      getQueueServiceClient: jest.fn().mockReturnValue(mockQueueServiceClient),
      withRetry: jest.fn((operation) => operation()),
    } as any;

    schemaClient = new SchemaClient(mockConnection);
  });

  describe("registerSchema", () => {
    it("should register a new schema", async () => {
      const schemaId = "test-schema";
      const content = '{"type": "object"}';
      const mockResponse: QueueServiceTypes.RegisterSchemaResponse = {
        schemaId,
        version: 1,
        createdAt: "2024-01-01T00:00:00Z",
      };

      mockQueueServiceClient.registerSchema.mockImplementation(
        (_req: any, callback: any) => callback(null, mockResponse),
      );

      const result = await schemaClient.registerSchema(schemaId, content, {
        name: "Test Schema",
        description: "A test schema",
      });

      expect(result).toEqual(mockResponse);
      expect(mockQueueServiceClient.registerSchema).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaId,
          content,
          name: "Test Schema",
          description: "A test schema",
          contentType: "json-schema",
        }),
        expect.any(Function),
      );
    });

    it("should throw error if schemaId is missing", async () => {
      await expect(schemaClient.registerSchema("", "{}")).rejects.toThrow(
        "schemaId is required",
      );
    });

    it("should throw error if content is missing", async () => {
      await expect(
        schemaClient.registerSchema("test-schema", ""),
      ).rejects.toThrow("content is required");
    });
  });

  describe("getSchema", () => {
    it("should get a specific schema version", async () => {
      const mockSchema = {
        schemaId: "test-schema",
        version: 1,
        name: "Test Schema",
        description: "Test",
        content: '{"type": "object"}',
        contentType: "json-schema",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        isActive: true,
        metadata: {},
      };

      mockQueueServiceClient.getSchema.mockImplementation(
        (_req: any, callback: any) => callback(null, { schema: mockSchema }),
      );

      const result = await schemaClient.getSchema("test-schema", 1);

      expect(result).toEqual(mockSchema);
      expect(mockQueueServiceClient.getSchema).toHaveBeenCalledWith(
        { schemaId: "test-schema", version: 1 },
        expect.any(Function),
      );
    });

    it("should get latest version when version not specified", async () => {
      mockQueueServiceClient.getSchema.mockImplementation(
        (_req: any, callback: any) => callback(null, { schema: null }),
      );

      await schemaClient.getSchema("test-schema");

      expect(mockQueueServiceClient.getSchema).toHaveBeenCalledWith(
        { schemaId: "test-schema", version: 0 },
        expect.any(Function),
      );
    });
  });

  describe("listSchemas", () => {
    it("should list all schemas", async () => {
      const mockSchemas: QueueServiceTypes.SchemaInfo[] = [
        {
          schemaId: "schema-1",
          latestVersion: 2,
          name: "Schema 1",
          description: "First schema",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          versionCount: 2,
          isActive: true,
        },
      ];

      mockQueueServiceClient.listSchemas.mockImplementation(
        (_req: any, callback: any) =>
          callback(null, { schemas: mockSchemas, totalCount: 1 }),
      );

      const result = await schemaClient.listSchemas();

      expect(result).toEqual(mockSchemas);
      expect(mockQueueServiceClient.listSchemas).toHaveBeenCalledWith(
        { prefix: "", pageSize: 100, pageToken: "", activeOnly: false },
        expect.any(Function),
      );
    });

    it("should filter by prefix", async () => {
      mockQueueServiceClient.listSchemas.mockImplementation(
        (_req: any, callback: any) =>
          callback(null, { schemas: [], totalCount: 0 }),
      );

      await schemaClient.listSchemas({ prefix: "user-" });

      expect(mockQueueServiceClient.listSchemas).toHaveBeenCalledWith(
        { prefix: "user-", pageSize: 100, pageToken: "", activeOnly: false },
        expect.any(Function),
      );
    });
  });

  describe("deleteSchema", () => {
    it("should delete a specific schema version", async () => {
      mockQueueServiceClient.deleteSchema.mockImplementation(
        (_req: any, callback: any) => callback(null, { success: true }),
      );

      const result = await schemaClient.deleteSchema("test-schema", 1);

      expect(result).toBe(true);
      expect(mockQueueServiceClient.deleteSchema).toHaveBeenCalledWith(
        { schemaId: "test-schema", version: 1 },
        expect.any(Function),
      );
    });

    it("should delete all versions when version not specified", async () => {
      mockQueueServiceClient.deleteSchema.mockImplementation(
        (_req: any, callback: any) => callback(null, { success: true }),
      );

      await schemaClient.deleteSchema("test-schema");

      expect(mockQueueServiceClient.deleteSchema).toHaveBeenCalledWith(
        { schemaId: "test-schema", version: 0 },
        expect.any(Function),
      );
    });
  });

  describe("validatePayload", () => {
    it("should validate payload successfully", async () => {
      const payload = { name: "John", age: 30 };
      const mockResponse = {
        valid: true,
        errors: [],
        schemaId: "test-schema",
        schemaVersion: 1,
      };

      mockQueueServiceClient.validatePayload.mockImplementation(
        (_req: any, callback: any) => callback(null, mockResponse),
      );

      const result = await schemaClient.validatePayload("test-schema", payload);

      expect(result).toEqual(mockResponse);
      expect(mockQueueServiceClient.validatePayload).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaId: "test-schema",
          version: 0,
          payload: JSON.stringify(payload),
        }),
        expect.any(Function),
      );
    });

    it("should handle JSON string payload", async () => {
      const payload = '{"name":"John","age":30}';
      const mockResponse = {
        valid: true,
        errors: [],
        schemaId: "test-schema",
        schemaVersion: 1,
      };

      mockQueueServiceClient.validatePayload.mockImplementation(
        (_req: any, callback: any) => callback(null, mockResponse),
      );

      const result = await schemaClient.validatePayload("test-schema", payload);

      expect(result).toEqual(mockResponse);
      expect(mockQueueServiceClient.validatePayload).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaId: "test-schema",
          version: 0,
          payload,
        }),
        expect.any(Function),
      );
    });

    it("should return validation errors when payload is invalid", async () => {
      const payload = { name: "John", age: "thirty" };
      const mockResponse = {
        valid: false,
        errors: [
          {
            field: "age",
            errorCode: "INVALID_TYPE",
            message: "Expected integer, got string",
            details: { expected: "integer", actual: "string" },
          },
        ],
        schemaId: "test-schema",
        schemaVersion: 1,
      };

      mockQueueServiceClient.validatePayload.mockImplementation(
        (_req: any, callback: any) => callback(null, mockResponse),
      );

      const result = await schemaClient.validatePayload(
        "test-schema",
        payload,
        1,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe("age");
      expect(mockQueueServiceClient.validatePayload).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaId: "test-schema",
          version: 1,
          payload: JSON.stringify(payload),
        }),
        expect.any(Function),
      );
    });

    it("should throw error if schemaId is missing", async () => {
      await expect(
        schemaClient.validatePayload("", { test: "data" }),
      ).rejects.toThrow("schemaId is required");
    });

    it("should throw error if payload is missing", async () => {
      await expect(
        schemaClient.validatePayload("test-schema", null as any),
      ).rejects.toThrow("payload is required");
    });

    it("should reject when server returns error", async () => {
      mockQueueServiceClient.validatePayload.mockImplementation(
        (_req: any, callback: any) =>
          callback(new Error("Schema not found"), null),
      );

      await expect(
        schemaClient.validatePayload("test-schema", { test: "data" }),
      ).rejects.toThrow("Schema not found");
    });

    it("should reject when response is empty", async () => {
      mockQueueServiceClient.validatePayload.mockImplementation(
        (_req: any, callback: any) => callback(null, null),
      );

      await expect(
        schemaClient.validatePayload("test-schema", { test: "data" }),
      ).rejects.toThrow("Empty response from server");
    });
  });
});
