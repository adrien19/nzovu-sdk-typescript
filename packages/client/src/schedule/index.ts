import {
  ListOptions,
  PageOptions,
  page,
  text,
  integer,
  schedule as validateSchedule,
} from "../utils/contracts";
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
    validateSchedule(schedule);

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.CreateScheduleRequest = {
          schedule,
        };

        client.createSchedule(request, (error, response) => {
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
            if (!error && response == null) {
              reject(new Error("Empty response from server"));
              return;
            }
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
  async listSchedules(
    options: ListOptions = {},
  ): Promise<QueueServiceTypes.ListSchedulesResponse> {
    const paging = page(options);
    text(options.prefix ?? "", "prefix", false);
    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.ListSchedulesResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.ListSchedulesRequest = {
            prefix: options.prefix ?? "",
            ...paging,
          };

          client.listSchedules(request, (error, response) => {
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
   * Get schedule execution history
   *
   * @param scheduleId - The schedule ID to get history for
   * @param options - Page size (0 uses server default) and opaque continuation token
   */
  async getScheduleHistory(
    scheduleId: string,
    options: PageOptions = {},
  ): Promise<QueueServiceTypes.GetScheduleHistoryResponse> {
    validateRequired(scheduleId, "scheduleId");
    const paging = page(options);

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.GetScheduleHistoryResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.GetScheduleHistoryRequest = {
            scheduleId,
            ...paging,
          };

          client.getScheduleHistory(request, (error, response) => {
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
  async validateCalendarSchedule(
    calendarSchedule: ProtoSchedule.CalendarSchedule,
  ): Promise<QueueServiceTypes.ValidateCalendarScheduleResponse> {
    validateRequired(calendarSchedule, "calendarSchedule");
    return new Promise((resolve, reject) => {
      this.connection
        .getQueueServiceClient()
        .validateCalendarSchedule({ calendarSchedule }, (error, result) => {
          if (error) reject(handleGrpcError(error));
          else if (!result) reject(new Error("Empty response from server"));
          else resolve(result);
        });
    });
  }

  async previewCalendarSchedule(
    calendarSchedule: ProtoSchedule.CalendarSchedule,
    count = 0,
  ): Promise<QueueServiceTypes.PreviewCalendarScheduleResponse> {
    validateRequired(calendarSchedule, "calendarSchedule");
    integer(count, "count");
    return new Promise((resolve, reject) => {
      this.connection
        .getQueueServiceClient()
        .previewCalendarSchedule(
          { calendarSchedule, count },
          (error, result) => {
            if (error) reject(handleGrpcError(error));
            else if (!result) reject(new Error("Empty response from server"));
            else resolve(result);
          },
        );
    });
  }
}
