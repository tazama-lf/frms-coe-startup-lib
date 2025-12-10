// SPDX-License-Identifier: Apache-2.0
import type { IStartupService, onMessageFunction } from '..';
import type { ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import type { tHeader } from '../interfaces/iStartupService';
import { JetstreamService } from './jetstreamService';
import { NatsService } from './natsService';

export class StartupFactory implements IStartupService {
  startupService: IStartupService;
  commandChannel: JetstreamService = new JetstreamService();
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

  // Command Channel Methods
  async initCommandChannel(
    onMessage: onMessageFunction,
    consumerStream: string,
    loggerService?: ILoggerService,
    producerStreamName?: string,
  ): Promise<boolean> {
    try {
      return await this.commandChannel.init(
        onMessage,
        loggerService,
        [consumerStream],
        producerStreamName ?? startupConfig.commandChannelProducerStreamName,
        true,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      const wrappedError = new Error(`Error when starting up Command Channel: ${errorMessage}`);
      if (error instanceof Error) {
        wrappedError.stack = error.stack;
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }

  async initCommandChannelProducer(loggerService?: ILoggerService, producerStreamName?: string): Promise<boolean> {
    try {
      return await this.commandChannel.initProducer(
        loggerService,
        producerStreamName ?? startupConfig.commandChannelProducerStreamName,
        true,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      const wrappedError = new Error(`Error when starting up Command Channel Producer: ${errorMessage}`);
      if (error instanceof Error) {
        wrappedError.stack = error.stack;
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }

  async handleResponseCommandChannel(response: object, subject?: string[], headers?: tHeader[]): Promise<void> {
    await this.commandChannel.handleResponse(response, subject, headers);
  }
}
