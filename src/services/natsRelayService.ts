import { connect, type NatsConnection } from 'nats';
import { relayConfig } from '../interfaces/iRelayConfig';
import type { IRelay } from '../interfaces/iRelayService';
import type { ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import { getLogger } from '../utils';

export class NatsRelay implements IRelay {
  private readonly config = relayConfig;
  private NatsConn_Producer?: NatsConnection;
  private logger?: ILoggerService | Console;

  async init(loggerService?: ILoggerService): Promise<void> {
    this.logger = getLogger(startupConfig, loggerService);

    this.NatsConn_Producer = await connect({
      servers: this.config.destinationUrl,
    });
    this.logger.log(`[TRS]: Connected to Client NATS: ${JSON.stringify(this.NatsConn_Producer.info, null, 4)}`);
  }
  async relay(data: Uint8Array): Promise<void> {
    try {
      this.NatsConn_Producer?.publish(relayConfig.producerStream, data);
    } catch (error) {
      this.logger?.error(`[TRS]: Connected to Client NATS: ${JSON.stringify(this.NatsConn_Producer?.info, null, 4)}`);
    }
  }
}