import { Queue as ProtoQueue, QueueServiceTypes } from "@nzovu/proto";
import { Connection } from "../connection";
import { handleGrpcError, validateRequired } from "../utils/errors";

/**
 * Queue client for managing queues
 */
export class QueueClient {
  constructor(private readonly connection: Connection) {}

  /**
   * Create a new queue
   */
  async createQueue(
    name: string,
    metadata?: ProtoQueue.QueueMetadata,
  ): Promise<boolean> {
    validateRequired(name, "name");

    const metadataWithDefaults: ProtoQueue.QueueMetadata = {
      type: metadata?.type || ProtoQueue.QueueType.SIMPLE,
      leaseDuration: metadata?.leaseDuration || { seconds: "30", nanos: 0 },
      defaultMaxAttempts: metadata?.defaultMaxAttempts ?? 3,
      autoCreateDlq: metadata?.autoCreateDlq ?? true,
      exclusivityKey: metadata?.exclusivityKey ?? "",
      deadLetterQueueName: metadata?.deadLetterQueueName ?? "",
      maxPayloadSize: metadata?.maxPayloadSize ?? 0,
      allowedContentTypes: metadata?.allowedContentTypes ?? [],
      schemaRequired: metadata?.schemaRequired ?? false,
      schemaId: metadata?.schemaId ?? "",
      leasePolicy: metadata?.leasePolicy,
      ...metadata,
    };

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.CreateQueueRequest = {
          name,
          metadata: metadataWithDefaults,
        };

        client.createQueue(request, (error, response) => {
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
   * Delete a queue
   */
  async deleteQueue(name: string): Promise<boolean> {
    validateRequired(name, "name");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.DeleteQueueRequest = {
          name,
        };

        client.deleteQueue(request, (error, response) => {
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
   * Get queue state and statistics
   */
  async getQueueState(
    queueName: string,
  ): Promise<QueueServiceTypes.GetQueueStateResponse> {
    validateRequired(queueName, "queueName");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.GetQueueStateResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.GetQueueStateRequest = {
            queueName,
          };

          client.getQueueState(request, (error, response) => {
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
   * List queues
   */
  async listQueues(prefix?: string): Promise<ProtoQueue.Queue[]> {
    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoQueue.Queue[]>((resolve, reject) => {
        const request: QueueServiceTypes.ListQueuesRequest = {
          prefix: prefix || "",
          pageSize: 0,
          pageToken: "",
        };

        client.listQueues(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.queues || []);
          }
        });
      });
    });
  }
}
