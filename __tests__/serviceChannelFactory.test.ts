// SPDX-License-Identifier: Apache-2.0

// Red-first tests for the StartupFactory service-channel delegation
// (frms-coe-startup-lib#279, Part B - locked decision Q1).
// StartupFactory is the only value-export from the package barrel, so the three
// new primitives must be reachable through it. The factory delegates them as
// thin pass-throughs to the single underlying NatsService instance (no separate
// channel client, no wrap-and-throw, no process.on restart hooks).

jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

process.env.NODE_ENV = 'test';
process.env.SERVER_URL = '0.0.0.0:4222';
process.env.FUNCTION_NAME = 'test-function';

import { StartupFactory } from '../src';

type FactorySurface = {
  initServiceChannelProducer: (loggerService?: unknown) => Promise<boolean>;
  publishServiceChannel: (body: Uint8Array, subject?: string) => Promise<void>;
  initServiceChannel: (onMessage: (data: Uint8Array) => void, subject?: string, loggerService?: unknown) => Promise<boolean>;
};

describe('StartupFactory exposes the service-channel surface (Q1)', () => {
  it('exposes initServiceChannelProducer, publishServiceChannel and initServiceChannel', () => {
    const factory = new StartupFactory() as unknown as FactorySurface;
    expect(typeof factory.initServiceChannelProducer).toBe('function');
    expect(typeof factory.publishServiceChannel).toBe('function');
    expect(typeof factory.initServiceChannel).toBe('function');
  });

  it('delegates initServiceChannelProducer to the underlying startupService', async () => {
    const factory = new StartupFactory();
    const delegate = (factory as unknown as { startupService: Record<string, unknown> }).startupService;
    const spy = jest.fn().mockResolvedValue(true);
    delegate.initServiceChannelProducer = spy;

    await (factory as unknown as FactorySurface).initServiceChannelProducer();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delegates publishServiceChannel to the underlying startupService', async () => {
    const factory = new StartupFactory();
    const delegate = (factory as unknown as { startupService: Record<string, unknown> }).startupService;
    const spy = jest.fn().mockResolvedValue(undefined);
    delegate.publishServiceChannel = spy;

    const payload = new Uint8Array([1, 2, 3]);
    await (factory as unknown as FactorySurface).publishServiceChannel(payload, 'svc.forward');

    expect(spy).toHaveBeenCalledWith(payload, 'svc.forward');
  });

  it('delegates initServiceChannel to the underlying startupService', async () => {
    const factory = new StartupFactory();
    const delegate = (factory as unknown as { startupService: Record<string, unknown> }).startupService;
    const spy = jest.fn().mockResolvedValue(true);
    delegate.initServiceChannel = spy;

    const onMessage = (): void => undefined;
    await (factory as unknown as FactorySurface).initServiceChannel(onMessage, 'svc.reply');

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
