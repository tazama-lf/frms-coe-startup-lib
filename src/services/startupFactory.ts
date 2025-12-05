// SPDX-License-Identifier: Apache-2.0

import type { IStartupService, onMessageFunction } from '..';
import type { ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import { JetstreamService } from './jetstreamService';
import { NatsService } from './natsService';

export class StartupFactory implements IStartupService {
  startupService: IStartupService;
  /**
   *  Initializes a new startup service which would either be a Jetstream or Nats server, depending on the configurd SERVER_TYPE env variable ('nats' | 'jestream')
   */
  constructor() {
    switch (startupConfig.startupType) {
      case 'jetstream':
        this.startupService = new JetstreamService();
        break;
      case 'nats':
        this.startupService = new NatsService();
        break;
    }
  }

  async init(
    onMessage: onMessageFunction,
    loggerService?: ILoggerService,
    parConsumerStreamNames?: string[],
    parProducerStreamName?: string,
  ): Promise<boolean> {
    process.on('uncaughtException', (): void => {
      this.startupService.init(onMessage, loggerService, parConsumerStreamNames, parProducerStreamName);
    });

    process.on('unhandledRejection', (): void => {
      this.startupService.init(onMessage, loggerService, parConsumerStreamNames, parProducerStreamName);
    });

    return await this.startupService.init(onMessage, loggerService, parConsumerStreamNames, parProducerStreamName);
  }

  async initProducer(loggerService?: ILoggerService, parProducerStreamName?: string): Promise<boolean> {
    process.on('uncaughtException', (): void => {
      this.startupService.initProducer(loggerService, parProducerStreamName);
    });

    process.on('unhandledRejection', (): void => {
      this.startupService.initProducer(loggerService, parProducerStreamName);
    });

    return await this.startupService.initProducer(loggerService, parProducerStreamName);
  }

  async handleResponse(response: object, subject?: string[]): Promise<void> {
    await this.startupService.handleResponse(response, subject);
  }

  // await commandChannel.handleResponse();

  async initCommandChannel(onMessage: onMessageFunction, consumerStream: string, loggerService?: ILoggerService): Promise<boolean> {
    try {
      const commandChannel = new JetstreamService();
      await commandChannel.init(onMessage, loggerService, [consumerStream]);
    } catch (error) {
      throw new Error(`Error when starting up Command Channel ${JSON.stringify(error)}`);
    }

    return true;
  }
}
