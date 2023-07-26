// init, initProducer, handleResponse

import { type ILoggerService } from '.';
import { type onMessageFunction } from '../types/onMessageFunction';

export interface IStartupService {
  init: (onMessage: onMessageFunction, loggerService?: ILoggerService) => Promise<void>;
  initProducer: (loggerService?: ILoggerService) => Promise<void>;
  handleResponse: (response: unknown, subject?: string[]) => Promise<void>;
}
