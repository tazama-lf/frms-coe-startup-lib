import { type ILoggerService, type IStartupConfig } from './interfaces';
import { startupConfig } from './interfaces/iStartupConfig';
import { type IStartupService } from './interfaces/iStartupService';
import { JetstreamService } from './services/jetstreamService';
import { type onMessageFunction } from './types/onMessageFunction';

export type { IStartupConfig, IStartupService, onMessageFunction };

export class StartupFactory implements IStartupService {
  startupService: IStartupService;
  /**
   *  Initializes a new startup service which would either be a Jetstream or Nats server, depending on the configurd SERVER_TYPE env variable ('nats' | 'jestream')
   */
  constructor() {
    switch (startupConfig.serverType) {
      case 'jetstream':
        this.startupService = new JetstreamService();
        break;
      case 'nats':
        this.startupService = new JetstreamService();
        break;
    }
  }

  async init(onMessage: onMessageFunction, loggerService?: ILoggerService | undefined): Promise<boolean> {
    return await this.startupService.init(onMessage, loggerService);
  }

  async handleResponse(response: unknown, subject?: string[] | undefined): Promise<void> {
    await this.startupService.handleResponse(response, subject);
  }
}
