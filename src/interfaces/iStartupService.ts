// init, initProducer, handleResponse

import { type ILoggerService } from '.';
import { type onMessageFunction } from '../types/onMessageFunction';

export interface IStartupService {
  init: (onMessage: onMessageFunction, loggerService?: ILoggerService) => Promise<boolean>;
  handleResponse: (response: unknown, subject?: string[]) => Promise<void>;
}
