import { PageOptions, page } from "../utils/contracts";
import { QueueServiceTypes } from "@nzovu/proto";
import { Connection } from "../connection";
import { handleGrpcError, validateRequired } from "../utils/errors";

/**
 * DLQ statistics response
 */
export interface DLQStats {
  name: string;
  messageCount: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dead Letter Queue client for DLQ operations
 */
export class DLQClient {
  constructor(private readonly connection: Connection) {}

  /**
   * Get messages from a Dead Letter Queue
   *
   * @param dlqName - Name of the DLQ
   * @param options - Page size (0 uses server default) and opaque continuation token
   */
  async getDLQMessages(
    dlqName: string,
    options: PageOptions = {},
  ): Promise<QueueServiceTypes.GetDLQMessagesResponse> {
    validateRequired(dlqName, "dlqName");
    const paging = page(options);

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.GetDLQMessagesResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.GetDLQMessagesRequest = {
            dlqName,
            ...paging,
          };

          client.getDlqMessages(request, (error, response) => {
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
   * Requeue a message from DLQ back to a queue
   *
   * @param dlqName - Name of the DLQ
   * @param messageId - ID of the message to requeue
   * @param targetQueue - Required destination queue name
   */
  async requeueFromDLQ(
    dlqName: string,
    messageId: string,
    targetQueue: string,
  ): Promise<boolean> {
    validateRequired(dlqName, "dlqName");
    validateRequired(messageId, "messageId");
    validateRequired(targetQueue, "targetQueue");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.RequeueFromDLQRequest = {
          dlqName,
          messageId,
          targetQueue,
        };

        client.requeueFromDlq(request, (error, response) => {
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
   * Delete a message from DLQ
   *
   * @param dlqName - Name of the DLQ
   * @param messageId - ID of the message to delete
   */
  async deleteFromDLQ(dlqName: string, messageId: string): Promise<boolean> {
    validateRequired(dlqName, "dlqName");
    validateRequired(messageId, "messageId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.DeleteFromDLQRequest = {
          dlqName,
          messageId,
        };

        client.deleteFromDlq(request, (error, response) => {
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
   * Purge all messages from a DLQ
   *
   * @param dlqName - Name of the DLQ
   */
  async purgeDLQ(dlqName: string): Promise<boolean> {
    validateRequired(dlqName, "dlqName");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.PurgeDLQRequest = {
          dlqName,
        };

        client.purgeDlq(request, (error, response) => {
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
   * Get statistics for a DLQ
   *
   * @param dlqName - Name of the DLQ
   */
  async getDLQStats(dlqName: string): Promise<DLQStats> {
    validateRequired(dlqName, "dlqName");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<DLQStats>((resolve, reject) => {
        const request: QueueServiceTypes.GetDLQStatsRequest = {
          dlqName,
        };

        client.getDlqStats(request, (error, response) => {
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
          if (error) {
            reject(handleGrpcError(error));
          } else if (response) {
            resolve({
              name: response.name,
              messageCount: response.messageCount,
              createdAt: response.createdAt,
              updatedAt: response.updatedAt,
            });
          } else {
            reject(handleGrpcError(new Error("Empty response from server")));
          }
        });
      });
    });
  }
}
