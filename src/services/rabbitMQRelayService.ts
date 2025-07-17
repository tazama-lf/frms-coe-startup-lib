import type { Channel, Connection } from 'amqplib';
import amqplib from 'amqplib';
import { relayConfig } from '../interfaces/iRelayConfig';
import type { IRelay } from '../interfaces/iRelayService';
import type { ProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';
import { startupConfig } from '../interfaces/iStartupConfig';
import type { ILoggerService } from '../interfaces';
import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';
import { getLogger } from '../utils';

export class RabbitRelay implements IRelay {
  private readonly config = relayConfig;
  private RabbitConn?: Connection;
  private RabbitChannel?: Channel;
  private logger?: ILoggerService | Console;
  private queue?: string;

  async init(config: ProcessorConfig, loggerService?: ILoggerService): Promise<void> {
    this.queue = validateEnvVar('QUEUE', 'string').toString();

    this.logger = getLogger(startupConfig, loggerService);

    this.RabbitConn = await amqplib.connect(this.config.destinationUrl);
    this.RabbitChannel = await this.RabbitConn.createChannel();

    this.logger.log('[TRS]: Connected to Client RabbitMQ');

    await this.RabbitChannel.assertQueue(config.functionName, {
      durable: false,
    });
  }
  async relay(data: Uint8Array): Promise<void> {
    try {
      this.RabbitChannel?.sendToQueue(this.queue!, Buffer.from(data));

      this.logger?.log(`Message relayed to RabbitMQ on ${this.queue}`);
    } catch (error) {
      this.logger?.error(`Error relaying to RabbitMQ ${JSON.stringify(error)}`);
    }
  }
}
