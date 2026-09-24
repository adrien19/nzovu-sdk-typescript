import { Schedule as ProtoSchedule, QueueServiceTypes } from "@nzovu/proto";
import { Connection } from "../connection";
import { handleGrpcError, validateRequired } from "../utils/errors";

/**
 * Schedule client for managing scheduled tasks
 */
export class ScheduleClient {
  constructor(private readonly connection: Connection) {}

  /**
   * Create a schedule
   */
  async createSchedule(schedule: ProtoSchedule.Schedule): Promise<boolean> {
    validateRequired(schedule, "schedule");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.CreateScheduleRequest = {
          schedule,
        };

        client.createSchedule(request, (error, response) => {
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
   * Get schedule details
   */
  async getSchedule(
    scheduleId: string,
  ): Promise<ProtoSchedule.Schedule | undefined> {
    validateRequired(scheduleId, "scheduleId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoSchedule.Schedule | undefined>(
        (resolve, reject) => {
          const request: QueueServiceTypes.GetScheduleRequest = {
            scheduleId,
          };

          client.getSchedule(request, (error, response) => {
            if (error) {
              reject(handleGrpcError(error));
            } else {
              resolve(response?.schedule);
            }
          });
        },
      );
    });
  }

  /**
   * List schedules
   */
  async listSchedules(prefix?: string): Promise<ProtoSchedule.Schedule[]> {
    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoSchedule.Schedule[]>((resolve, reject) => {
        const request: QueueServiceTypes.ListSchedulesRequest = {
          prefix: prefix || "",
          pageSize: 0,
          pageToken: "",
        };

        client.listSchedules(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.schedules || []);
          }
        });
      });
    });
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    validateRequired(scheduleId, "scheduleId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.DeleteScheduleRequest = {
          scheduleId,
        };

        client.deleteSchedule(request, (error, response) => {
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
   * Pause a schedule
   */
  async pauseSchedule(scheduleId: string): Promise<boolean> {
    validateRequired(scheduleId, "scheduleId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.PauseScheduleRequest = {
          scheduleId,
        };

        client.pauseSchedule(request, (error, response) => {
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
   * Resume a paused schedule
   */
  async resumeSchedule(scheduleId: string): Promise<boolean> {
    validateRequired(scheduleId, "scheduleId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.ResumeScheduleRequest = {
          scheduleId,
        };

        client.resumeSchedule(request, (error, response) => {
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
   * Get schedule execution history
   *
   * @param scheduleId - The schedule ID to get history for
   * @param limit - Maximum number of history records to return (default: 100)
   */
  async getScheduleHistory(
    scheduleId: string,
    limit?: number,
  ): Promise<ProtoSchedule.ScheduleHistory | undefined> {
    validateRequired(scheduleId, "scheduleId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoSchedule.ScheduleHistory | undefined>(
        (resolve, reject) => {
          const request: QueueServiceTypes.GetScheduleHistoryRequest = {
            scheduleId,
            pageSize: limit ?? 100,
            pageToken: "",
          };

          client.getScheduleHistory(request, (error, response) => {
            if (error) {
              reject(handleGrpcError(error));
            } else {
              resolve(response?.scheduleHistory);
            }
          });
        },
      );
    });
  }
}
