// SPDX-License-Identifier: Apache-2.0

import type { ILoggerService } from '../src/interfaces';
import type { NatsService } from '../src/services/natsService';
import type { onMessageFunction } from '../src/types/onMessageFunction';

jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());
jest.mock('@tazama-lf/frms-coe-lib/lib/helpers/protobuf', () => ({
  createMessageBuffer: jest.fn(() => new Uint8Array([1])),
  decodeMessageBuffer: jest.fn(() => ({ transaction: {} })),
}));

const ORIGINAL_ENV = { ...process.env };
const logger: ILoggerService = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const noop: onMessageFunction = async () => undefined;
const tick = async (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let service: NatsService;
let nats: typeof import('nats') & { __reset: () => void };

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'production',
    SERVER_URL: 'fake-nats:4222',
    FUNCTION_NAME: 'test-function',
    NATS_AUTHENTICATED: 'false',
    CONSUMER_STREAM: '',
    SERVICE_CHANNEL_PRODUCER: '',
    SERVICE_CHANNEL_CONSUMER: '',
  };
  jest.isolateModules(() => {
    nats = require('nats');
    nats.__reset();
    const { NatsService } = require('../src/services/natsService');
    service = new NatsService();
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await service.NatsConn?.drain();
  process.env = { ...ORIGINAL_ENV };
});

describe('NATS initialization failures', () => {
  it.each([undefined, []])('rejects when consumer subjects are missing (%j)', async (subjects) => {
    await expect(service.init(noop, logger, subjects)).rejects.toThrow('No Consumer Stream Name Provided');
    expect(nats.connect).not.toHaveBeenCalled();
  });

  it.each([new Error('subscription failed'), { reason: 'subscription failed' }])(
    'logs and rethrows a subscription failure (%j)',
    async (failure) => {
      await service.initProducer(logger);
      jest.mocked(nats.connect).mockResolvedValueOnce(service.NatsConn!);
      jest.spyOn(service.NatsConn!, 'subscribe').mockImplementationOnce(() => {
        throw failure;
      });

      const result = service.init(noop, logger, ['transactions']);
      if (failure instanceof Error) {
        await expect(result).rejects.toBe(failure);
      } else {
        await expect(result).rejects.toThrow(JSON.stringify(failure));
      }
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining(failure instanceof Error ? failure.message : JSON.stringify(failure)),
      );
    },
  );

  it.each([new Error('connection refused'), { reason: 'connection refused' }])(
    'logs and rejects producer connection failures (%j)',
    async (failure) => {
      jest.mocked(nats.connect).mockRejectedValueOnce(failure);

      const result = service.initProducer(logger);
      if (failure instanceof Error) {
        await expect(result).rejects.toBe(failure);
      } else {
        await expect(result).rejects.toThrow(JSON.stringify(failure));
      }
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining(`with error: ${failure instanceof Error ? failure.message : JSON.stringify(failure)}`),
      );
      expect(service.NatsConn).toBeUndefined();
    },
  );

  it('logs non-Error service-channel connection failures and resolves false', async () => {
    jest.mocked(nats.connect).mockRejectedValueOnce({ reason: 'offline' });

    await expect(service.initServiceChannelProducer(logger)).resolves.toBe(false);
    expect(logger.log).toHaveBeenCalledWith('Service-channel connect failed (non-fatal): {"reason":"offline"}');
  });

  it('logs when the service-channel connection closes', async () => {
    await service.initServiceChannelProducer(logger);
    await service.NatsConn!.drain();

    expect(logger.log).toHaveBeenCalledWith('Service-channel connection lost to NATS Server.');
  });

  it('warns about dropped service-channel messages after a failed connection', async () => {
    jest.mocked(nats.connect).mockRejectedValueOnce(new Error('offline'));
    await service.initServiceChannelProducer(logger);

    await expect(service.publishServiceChannel(new Uint8Array([1, 2, 3]), 'svc.forward')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Service-channel publish skipped (no live connection): 3 bytes dropped for subject:[svc.forward]',
    );
    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('Service-channel published'));
  });
});

const handlerFailures = [
  { mode: 'synchronous', failure: new Error('handler failed') },
  { mode: 'synchronous', failure: { reason: 'handler failed' } },
  { mode: 'asynchronous', failure: new Error('handler failed') },
  { mode: 'asynchronous', failure: { reason: 'handler failed' } },
];

describe.each(handlerFailures)('$mode message handler failure ($failure)', ({ mode, failure }) => {
  const fail = (): Promise<void> => {
    if (mode === 'synchronous') throw failure;
    return Promise.reject(failure);
  };
  const errorMessage = failure instanceof Error ? failure.message : JSON.stringify(failure);

  it('logs the transaction handler failure and continues consuming', async () => {
    await service.initProducer(logger);
    const subscription = service.NatsConn!.subscribe('transactions');
    const handler = jest
      .fn<ReturnType<onMessageFunction>, Parameters<onMessageFunction>>()
      .mockImplementationOnce(fail)
      .mockResolvedValue(undefined);
    const pump = service.subscribe(subscription, handler);

    try {
      service.NatsConn!.publish('transactions', new Uint8Array([1]));
      await tick();
      expect(logger.error).toHaveBeenCalledWith(`Error in message handler on default path: ${errorMessage}`);

      service.NatsConn!.publish('transactions', new Uint8Array([2]));
      await tick();
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith({ transaction: {} }, expect.any(Function));
      expect(logger.error).toHaveBeenCalledTimes(1);
    } finally {
      subscription.unsubscribe();
      await pump;
    }
  });

  it('logs the service-channel handler failure and continues consuming raw bytes', async () => {
    await service.initServiceChannelProducer(logger);
    const subscription = service.NatsConn!.subscribe('svc.forward');
    const handler = jest.fn<Promise<void>, [Uint8Array]>().mockImplementationOnce(fail).mockResolvedValue(undefined);
    const pump = service.consumeServiceChannel(subscription, handler);

    try {
      service.NatsConn!.publish('svc.forward', new Uint8Array([1]));
      await tick();
      expect(logger.error).toHaveBeenCalledWith(`Service-channel handler threw on subject:[svc.forward]: ${errorMessage}`);

      const secondMessage = new Uint8Array([2]);
      service.NatsConn!.publish('svc.forward', secondMessage);
      await tick();
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith(secondMessage);
      expect(logger.error).toHaveBeenCalledTimes(1);
    } finally {
      subscription.unsubscribe();
      await pump;
    }
  });
});
