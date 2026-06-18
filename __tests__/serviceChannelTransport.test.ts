// SPDX-License-Identifier: Apache-2.0

// Red-first tests for the core-NATS service-channel transport (frms-coe-startup-lib#279, Part B).
// The service channel carries OPAQUE bytes: the producer publishes the caller's
// Uint8Array verbatim and the consumer hands message.data to onMessage un-decoded -
// no protobuf, no CloudEvents. These tests target the public surface the
// implementation must add to NatsService; the surface does not exist yet, so they
// are expected to fail (red) until Part B is implemented.

import type { ILoggerService } from '../src/interfaces';

// Override the global no-op nats mock with a controllable shared-broker fake.
jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

// iStartupConfig reads these at module load when natsService is imported.
process.env.NODE_ENV = 'test';
process.env.SERVER_URL = '0.0.0.0:4222';
process.env.FUNCTION_NAME = 'test-function';

import * as nats from 'nats';
import { NatsService } from '../src/services/natsService';

// The service-channel public surface Part B must expose on NatsService.
// Cast-only so these red tests compile before the methods exist.
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
  __broker: {
    connectShouldFail: boolean;
    published: Array<{ subject: string; data: Uint8Array }>;
    subscriptions: Array<{ subject: string; opts?: { queue?: string } }>;
  };
  __reset: () => void;
} =>
  nats as unknown as {
    __broker: {
      connectShouldFail: boolean;
      published: Array<{ subject: string; data: Uint8Array }>;
      subscriptions: Array<{ subject: string; opts?: { queue?: string } }>;
    };
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

describe('service-channel producer - transport (AC#3, AC#2)', () => {
  it('connects once via core-NATS connect (no hard-coded JetStream client)', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);
    expect(nats.connect as unknown as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('publishes the caller bytes verbatim - no protobuf encode', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);
    const payload = new Uint8Array([1, 2, 3, 4]);

    await svc.publishServiceChannel(payload, 'svc.forward');

    expect(broker().published).toHaveLength(1);
    expect(broker().published[0].subject).toBe('svc.forward');
    expect(Buffer.from(broker().published[0].data)).toEqual(Buffer.from(payload));
  });
});

describe('service-channel producer - resilience (AC#3 degrade-not-throw)', () => {
  it('does not throw when the initial connect fails and resolves false', async () => {
    const svc = makeService();
    broker().connectShouldFail = true;

    await expect(svc.initServiceChannelProducer(logger)).resolves.toBe(false);
  });
});

describe('service-channel consumer (AC#4, AC#2)', () => {
  it('subscribes with NO queue group (broadcast, not the transaction-plane { queue } pattern)', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);

    await svc.initServiceChannel(() => undefined, 'svc.forward', logger);

    const sub = broker().subscriptions.find((s) => s.subject === 'svc.forward');
    expect(sub).toBeDefined();
    expect(sub?.opts?.queue).toBeUndefined();
  });

  it('hands raw message.data to onMessage un-decoded', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);
    const payload = new Uint8Array([9, 8, 7]);
    const received: Uint8Array[] = [];
    const got = new Promise<void>((resolve) => {
      void svc.initServiceChannel(
        (data) => {
          received.push(data);
          resolve();
        },
        'svc.forward',
        logger,
      );
    });

    // Allow the subscription to register before publishing.
    await new Promise((r) => setImmediate(r));
    await svc.publishServiceChannel(payload, 'svc.forward');
    await got;

    expect(Buffer.from(received[0])).toEqual(Buffer.from(payload));
  });
});

describe('service-channel fan-out (AC#4 - the broadcast proof)', () => {
  it('delivers every published message to every subscriber on the same subject', async () => {
    const subject = 'svc.forward';
    const subA = makeService();
    const subB = makeService();
    await subA.initServiceChannelProducer(logger);
    await subB.initServiceChannelProducer(logger);

    const receivedA: Uint8Array[] = [];
    const receivedB: Uint8Array[] = [];
    const gotA = new Promise<void>((resolve) => {
      void subA.initServiceChannel(
        (d) => {
          receivedA.push(d);
          resolve();
        },
        subject,
        logger,
      );
    });
    const gotB = new Promise<void>((resolve) => {
      void subB.initServiceChannel(
        (d) => {
          receivedB.push(d);
          resolve();
        },
        subject,
        logger,
      );
    });

    await new Promise((r) => setImmediate(r));

    const producer = makeService();
    await producer.initServiceChannelProducer(logger);
    await producer.publishServiceChannel(new Uint8Array([42]), subject);

    await Promise.all([gotA, gotB]);
    expect(Buffer.from(receivedA[0])).toEqual(Buffer.from([42]));
    expect(Buffer.from(receivedB[0])).toEqual(Buffer.from([42]));
  });
});

describe('service-channel required-when-used config enforcement (AC#5)', () => {
  // The transport test loads iStartupConfig without SERVICE_CHANNEL_PRODUCER /
  // CONSUMER set, so the configured subjects are empty. Using a primitive with
  // neither an explicit subject nor its env var must throw, mirroring the
  // transaction-plane validateEnvironment pattern.
  it('publishServiceChannel throws when no subject and SERVICE_CHANNEL_PRODUCER is unset', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);

    await expect(svc.publishServiceChannel(new Uint8Array([1]))).rejects.toThrow(/SERVICE_CHANNEL_PRODUCER/);
  });

  it('initServiceChannel throws when no subject and SERVICE_CHANNEL_CONSUMER is unset', async () => {
    const svc = makeService();
    await svc.initServiceChannelProducer(logger);

    await expect(svc.initServiceChannel(() => undefined)).rejects.toThrow(/SERVICE_CHANNEL_CONSUMER/);
  });
});

describe('service-channel logging (AC#7)', () => {
  it('logs the connection lifecycle on producer init', async () => {
    // getLogger swaps to console when env is 'test'/'dev' (see src/utils.ts), so the lifecycle
    // lines land on console.log here regardless of the injected logger. Assert on the specific
    // lifecycle message content - not a bare call count - so the test is deterministic to the
    // service-channel contract and cannot pass on unrelated console noise.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const svc = makeService();

    await svc.initServiceChannelProducer(logger);

    const messages = logSpy.mock.calls.map((call) => String(call[0]));
    expect(messages.some((message) => /service-channel connection/i.test(message))).toBe(true);
    expect(messages.some((message) => /service channel connected/i.test(message))).toBe(true);
    logSpy.mockRestore();
  });
});
