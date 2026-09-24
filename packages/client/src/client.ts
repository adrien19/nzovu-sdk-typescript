import { Connection } from "./connection";
import { DLQClient } from "./dlq";
import { defaultLogger } from "./logger";
import { MessageClient } from "./message";
import { QueueClient } from "./queue";
import { ScheduleClient } from "./schedule";
import { SchemaClient } from "./schema";
import { ClientConfig } from "./types";

/**
 * Main Nzovu client
 */
export class NzovuClient {
  private connection: Connection;
  private readonly _workerId?: string;

  public readonly queues: QueueClient;
  public readonly messages: MessageClient;
  public readonly schedules: ScheduleClient;
  public readonly schemas: SchemaClient;
  public readonly dlq: DLQClient;

  constructor(config: ClientConfig) {
    this.connection = new Connection(config.connection, config.requestTimeout);
    this._workerId = config.workerId;

    const logger = config.logger || defaultLogger;

    this.queues = new QueueClient(this.connection);
    this.messages = new MessageClient(
      this.connection,
      config.workerId,
      logger,
      config.maxManagedClaims,
    );
    this.schedules = new ScheduleClient(this.connection);
    this.schemas = new SchemaClient(this.connection);
    this.dlq = new DLQClient(this.connection);
  }

  /**
   * Get the workerId for this client instance
   */
  get workerId(): string | undefined {
    return this._workerId;
  }

  /**
   * Connect to Nzovu server
   */
  async connect(): Promise<void> {
    await this.connection.connect();
  }

  /**
   * Disconnect from Nzovu server
   */
  async disconnect(): Promise<void> {
    // Stop all active heartbeats before disconnecting
    this.messages.stopAllHeartbeats();
    await this.connection.disconnect();
    await this.messages.drain();
  }

  /**
   * Check if connected to server
   */
  isConnected(): boolean {
    return this.connection.isConnected();
  }
}
