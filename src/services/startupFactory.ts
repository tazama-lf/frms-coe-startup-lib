// SPDX-License-Identifier: Apache-2.0

import type { IStartupService, onMessageFunction } from '..';
import type { ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import { NatsService } from './natsService';

export class StartupFactory implements IStartupService {
  startupService: IStartupService;
  /**
   *  Initializes a new NATS startup service. NATS is the only supported transport; the switch retains a
   *  default arm so any unexpected startupType still resolves to NatsService rather than leaving the
   *  service undefined.
   */
  constructor() {
    // startupType is typed 'nats', but it is cast to string here so the default arm remains a genuine
    // runtime guard against any unexpected value (defence-in-depth) without tripping the
    // switch-exhaustiveness check.
    switch (startupConfig.startupType as string) {
      case 'nats':
        this.startupService = new NatsService();
        break;
      default:
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
}
