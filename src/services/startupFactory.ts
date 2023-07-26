import { type IStartupService, type onMessageFunction } from '..';
import { type ILoggerService } from '../interfaces';
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
      default:
        throw new Error('STARTUP_TYPE not set to a correct value.');
    }
  }

  /* eslint-disable @typescript-eslint/no-misused-promises */
  async init(onMessage: onMessageFunction, loggerService?: ILoggerService | undefined): Promise<void> {
    process.on('uncaughtException', async (): Promise<void> => {
      await this.startupService.init(onMessage, loggerService);
    });

    process.on('unhandledRejection', async (): Promise<void> => {
      await this.startupService.init(onMessage, loggerService);
    });

    await this.startupService.init(onMessage, loggerService);
  }

  async initProducer(loggerService?: ILoggerService | undefined): Promise<void> {
    process.on('uncaughtException', async (): Promise<void> => {
      await this.startupService.initProducer(loggerService);
    });

    process.on('unhandledRejection', async (): Promise<void> => {
      await this.startupService.initProducer(loggerService);
    });

    await this.startupService.initProducer(loggerService);
  }

  async handleResponse(response: unknown, subject?: string[] | undefined): Promise<void> {
    await this.startupService.handleResponse(response, subject);
  }
}
