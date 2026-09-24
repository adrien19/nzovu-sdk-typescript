import { ListOptions, page, text, leasePolicy } from "../utils/contracts";
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

    leasePolicy(metadata?.leasePolicy);

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.CreateQueueRequest = {
          name,
          metadata,
        };

        client.createQueue(request, (error, response) => {
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
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
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
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
   * List queues
   */
  async listQueues(
    options: ListOptions = {},
  ): Promise<QueueServiceTypes.ListQueuesResponse> {
    const paging = page(options);
    text(options.prefix ?? "", "prefix", false);
    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.ListQueuesResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.ListQueuesRequest = {
            prefix: options.prefix ?? "",
            ...paging,
          };

          client.listQueues(request, (error, response) => {
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
}
