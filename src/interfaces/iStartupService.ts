// SPDX-License-Identifier: Apache-2.0

// init, initProducer, handleResponse

import type { ILoggerService } from '.';
import type { onMessageFunction } from '../types/onMessageFunction';
export interface tHeader {
  key: string;
  value: string;
}
export interface IStartupService {
  init: (
    onMessage: onMessageFunction,
    loggerService?: ILoggerService,
    parConsumerStreamNames?: string[],
    parProducerStreamName?: string,
    isCommandChannel?: boolean,
  ) => Promise<boolean>;
  initProducer: (loggerService?: ILoggerService, parProducerStreamName?: string, isCommandChannel?: boolean) => Promise<boolean>;
  handleResponse: (response: object, subject?: string[], headers?: tHeader[]) => Promise<void>;
  initCommandChannel?: (response: onMessageFunction, subject: string, loggerService?: ILoggerService) => Promise<boolean>;
  handleResponseCommandChannel?: (response: object, subject?: string[], headers?: tHeader[]) => Promise<void>;
  initCommandChannelProducer?: (loggerService?: ILoggerService) => Promise<boolean>;
}
