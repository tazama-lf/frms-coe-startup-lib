// SPDX-License-Identifier: Apache-2.0

// init, initProducer, handleResponse

import type { ILoggerService } from '.';
import type { onMessageFunction } from '../types/onMessageFunction';

export interface IStartupService {
  init: (
    onMessage: onMessageFunction,
    loggerService?: ILoggerService,
    parConsumerStreamNames?: string[],
    parProducerStreamName?: string,
  ) => Promise<boolean>;
  initProducer: (loggerService?: ILoggerService, parProducerStreamName?: string) => Promise<boolean>;
  handleResponse: (response: object, subject?: string[]) => Promise<void>;

  // Runtime additive data-plane subscribe (#282). Optional and additive: extends the running
  // consumer with new subjects without reconnecting or tearing down existing subscriptions.
  addConsumers?: (subjects: string[], onMessage: onMessageFunction) => Promise<boolean>;

  // Service-channel transport (Part B, #279). Optional and additive: carries opaque bytes on an
  // isolated core-NATS subject, independent of the transaction-plane methods above.
  initServiceChannelProducer?: (loggerService?: ILoggerService) => Promise<boolean>;
  publishServiceChannel?: (body: Uint8Array, subject?: string) => Promise<void>;
  initServiceChannel?: (
    onMessage: (data: Uint8Array) => void | Promise<void>,
    subject?: string,
    loggerService?: ILoggerService,
  ) => Promise<boolean>;
}
