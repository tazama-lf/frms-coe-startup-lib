// SPDX-License-Identifier: Apache-2.0

// Red-first tests for the runtime additive data-plane subscribe seam
// `addConsumers` (frms-coe-startup-lib#282). `addConsumers` is the runtime sibling
// of `init`: `init` stands the consumers up on startup; `addConsumers` adds more
// to the already-running consumer at runtime WITHOUT reconnecting or tearing down
// the existing subscriptions (the additive half of make-before-break).
//
// These tests target a public surface NatsService does not yet expose, so they are
// expected to fail (red) until the method is implemented.

import type { ILoggerService } from '../src/interfaces';
import type { onMessageFunction } from '../src/types/onMessageFunction';

// Override the global no-op nats mock with the controllable shared-broker fake.
jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

// iStartupConfig reads these at module load when natsService is imported.
process.env.NODE_ENV = 'test';
process.env.SERVER_URL = '0.0.0.0:4222';
process.env.FUNCTION_NAME = 'test-function';

import * as nats from 'nats';
import { NatsService } from '../src/services/natsService';

// The runtime additive-subscribe surface #282 must add to NatsService.
// Cast-only so these red tests compile before the method exists.
type AddConsumersSurface = {
  addConsumers: (subjects: string[], onMessage: onMessageFunction) => Promise<boolean>;
};

const fakeNats = (): {
  __broker: {
    connectShouldFail: boolean;
    subscriptions: Array<{ subject: string; opts?: { queue?: string }; closed: boolean }>;
  };
  __reset: () => void;
} =>
  nats as unknown as {
    __broker: {
      connectShouldFail: boolean;
      subscriptions: Array<{ subject: string; opts?: { queue?: string }; closed: boolean }>;
    };
    __reset: () => void;
  };

const broker = (): ReturnType<typeof fakeNats>['__broker'] => fakeNats().__broker;

const makeService = (): NatsService & AddConsumersSurface => new NatsService() as unknown as NatsService & AddConsumersSurface;

const logger: ILoggerService = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const noop: onMessageFunction = async () => undefined;

// Establish a connected service with one initial data-plane consumer ('pub-rule-A'),
// exactly as `init` does on startup, so each test can exercise the runtime add path.
const connectedServiceWith = async (initial: string[]): Promise<NatsService & AddConsumersSurface> => {
  const svc = makeService();
  await svc.init(noop, logger, initial, 'producer-stream');
  return svc;
};

beforeEach(() => {
  fakeNats().__reset();
});

describe('addConsumers - additive subscribe (AC#2)', () => {
  it('subscribes new, non-empty subjects with the transaction-plane { queue } group', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await svc.addConsumers(['pub-rule-B'], noop);

    const subB = broker().subscriptions.find((s) => s.subject === 'pub-rule-B');
    expect(subB).toBeDefined();
    expect(subB?.opts?.queue).toBe('test-function');
  });

  it('extends consumerStreamName with the newly added subjects', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await svc.addConsumers(['pub-rule-B', 'pub-rule-C'], noop);

    expect(svc.consumerStreamName).toEqual(expect.arrayContaining(['pub-rule-A', 'pub-rule-B', 'pub-rule-C']));
  });

  it('hands each new subscription to the existing consume loop (subscribe) with the same onMessage', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);
    const subscribeSpy = jest.spyOn(svc, 'subscribe').mockResolvedValue(undefined);

    await svc.addConsumers(['pub-rule-B'], noop);

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect((subscribeSpy.mock.calls[0][0] as unknown as { subject: string }).subject).toBe('pub-rule-B');
    expect(subscribeSpy.mock.calls[0][1]).toBe(noop);
  });
});

describe('addConsumers - idempotent (AC#3)', () => {
  it('skips a subject already in consumerStreamName (no duplicate subscription)', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);
    const before = broker().subscriptions.filter((s) => s.subject === 'pub-rule-A').length;

    await svc.addConsumers(['pub-rule-A'], noop);

    const after = broker().subscriptions.filter((s) => s.subject === 'pub-rule-A').length;
    expect(after).toBe(before);
  });

  it('skips empty-string subjects', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await svc.addConsumers([''], noop);

    expect(broker().subscriptions.find((s) => s.subject === '')).toBeUndefined();
  });

  it('only the genuinely new subject of a mixed set is subscribed', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await svc.addConsumers(['pub-rule-A', '', 'pub-rule-B'], noop);

    expect(broker().subscriptions.filter((s) => s.subject === 'pub-rule-A')).toHaveLength(1);
    expect(broker().subscriptions.filter((s) => s.subject === 'pub-rule-B')).toHaveLength(1);
  });

  it('de-duplicates repeats within the input set (subscribes once)', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await svc.addConsumers(['pub-rule-B', 'pub-rule-B'], noop);

    expect(broker().subscriptions.filter((s) => s.subject === 'pub-rule-B')).toHaveLength(1);
  });
});

describe('addConsumers - make-before-break / no teardown (AC#4)', () => {
  it('does not reconnect (connect is not called again)', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);
    const connectMock = nats.connect as unknown as jest.Mock;
    const connectsBefore = connectMock.mock.calls.length;

    await svc.addConsumers(['pub-rule-B'], noop);

    expect(connectMock.mock.calls.length).toBe(connectsBefore);
  });

  it('leaves existing subscriptions open (no unsubscribe/drain)', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);
    const subA = broker().subscriptions.find((s) => s.subject === 'pub-rule-A');

    await svc.addConsumers(['pub-rule-B'], noop);

    expect(subA?.closed).toBe(false);
  });
});

describe('addConsumers - guard + return value (AC#5)', () => {
  it('returns false and subscribes nothing when there is no live connection', async () => {
    const svc = makeService();

    await expect(svc.addConsumers(['pub-rule-X'], noop)).resolves.toBe(false);
    expect(broker().subscriptions).toHaveLength(0);
  });

  it('resolves true on a successful add', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await expect(svc.addConsumers(['pub-rule-B'], noop)).resolves.toBe(true);
  });

  it('resolves true on a no-op add (all subjects already subscribed)', async () => {
    const svc = await connectedServiceWith(['pub-rule-A']);

    await expect(svc.addConsumers(['pub-rule-A'], noop)).resolves.toBe(true);
  });
});
