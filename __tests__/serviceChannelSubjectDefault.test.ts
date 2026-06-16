// SPDX-License-Identifier: Apache-2.0

// Red-first tests for the service-channel subject-defaulting positive path
// (frms-coe-startup-lib#279, Part B - AC#5).
// The required-when-used throw path lives in serviceChannelTransport.test.ts, which
// loads iStartupConfig WITHOUT the service-channel vars. startupConfig is a
// module-load singleton, so the complementary positive path - subject omitted but
// the env var present, so the primitive falls back to the configured subject - must
// load the config WITH those vars set. That is why it is a separate file: the env
// is fixed here before natsService (and its startupConfig import) is required.

import type { ILoggerService } from '../src/interfaces';

jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

process.env.NODE_ENV = 'test';
process.env.SERVER_URL = '0.0.0.0:4222';
process.env.FUNCTION_NAME = 'test-function';
process.env.SERVICE_CHANNEL_PRODUCER = 'svc.forward';
process.env.SERVICE_CHANNEL_CONSUMER = 'svc.reply';

import * as nats from 'nats';
import { NatsService } from '../src/services/natsService';

type ServiceChannelSurface = {
  initServiceChannelProducer: (loggerService?: ILoggerService) => Promise<boolean>;
  publishServiceChannel: (body: Uint8Array, subject?: string) => Promise<void>;
  initServiceChannel: (
    onMessage: (data: Uint8Array) => void | Promise<void>,
    subject?: string,
    loggerService?: ILoggerService,
  ) => Promise<boolean>;
};

const fakeNats = (): {
  __broker: { published: Array<{ subject: string }>; subscriptions: Array<{ subject: string }> };
  __reset: () => void;
} =>
  nats as unknown as {
    __broker: { published: Array<{ subject: string }>; subscriptions: Array<{ subject: string }> };
    __reset: () => void;
  };

const broker = (): ReturnType<typeof fakeNats>['__broker'] => fakeNats().__broker;

const makeService = (): NatsService & ServiceChannelSurface => new NatsService() as unknown as NatsService & ServiceChannelSurface;

const logger: ILoggerService = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

beforeEach(() => {
  fakeNats().__reset();
});

describe('service-channel subject defaulting from config (AC#5)', () => {
  it('publishServiceChannel falls back to SERVICE_CHANNEL_PRODUCER when no subject is given', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);

    await svc.publishServiceChannel(new Uint8Array([1, 2, 3]));

    expect(broker().published).toHaveLength(1);
    expect(broker().published[0].subject).toBe('svc.forward');
  });

  it('initServiceChannel falls back to SERVICE_CHANNEL_CONSUMER when no subject is given', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);

    void svc.initServiceChannel(() => undefined, undefined, logger);
    await new Promise((r) => setImmediate(r));

    const sub = broker().subscriptions.find((s) => s.subject === 'svc.reply');
    expect(sub).toBeDefined();
  });
});
