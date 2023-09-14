// init, initProducer, handleResponse

import { type ILoggerService } from '.';
import { type onMessageFunction } from '../types/onMessageFunction';

export interface IStartupService {
  init: (onMessage: onMessageFunction, loggerService?: ILoggerService) => Promise<boolean>;
  initProducer: (loggerService?: ILoggerService) => Promise<boolean>;
  handleResponse: (response: object, subject?: string[]) => Promise<void>;
}
