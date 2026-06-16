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
