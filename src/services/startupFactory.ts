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

  async init(onMessage: onMessageFunction, loggerService?: ILoggerService | undefined): Promise<boolean> {
    return await this.startupService.init(onMessage, loggerService);
  }

  async handleResponse(response: unknown, subject?: string[] | undefined): Promise<void> {
    await this.startupService.handleResponse(response, subject);
  }
}
