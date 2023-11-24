// init, initProducer, handleResponse

import { type ILoggerService } from '.';
import { type onMessageFunction } from '../types/onMessageFunction';

export interface IStartupService {
  init: (
    onMessage: onMessageFunction,
    loggerService?: ILoggerService,
    parConsumerStreamNames?: string[],
    parProducerStreamName?: string,
  ) => Promise<boolean>;
  initProducer: (loggerService?: ILoggerService, parProducerStreamName?: string) => Promise<boolean>;
  handleResponse: (response: object, subject?: string[]) => Promise<void>;
}
