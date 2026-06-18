// SPDX-License-Identifier: Apache-2.0

// Red-first tests for frms-coe-startup-lib#281:
// PRODUCER_STREAM becomes a run-time fallback, not a mandatory startup gate.
//
//   - validateEnvironment() no longer requires a producer stream (only SERVER_URL + FUNCTION_NAME);
//   - handleResponse() publishes explicit subjects with only a live connection;
//   - the no-subject default path requires PRODUCER_STREAM and fails loudly when absent
//     (no silent no-op);
//   - the no-subject default path still publishes to PRODUCER_STREAM when configured.
//
// These target the post-fix contract; the new-contract cases are expected to fail (red)
// until the NatsService change lands.

import type { ILoggerService } from '../src/interfaces';

// Override the global no-op nats mock with the controllable shared-broker fake.
jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

// Isolate routing from protobuf encoding - these tests assert destinations, not wire format.
jest.mock('@tazama-lf/frms-coe-lib/lib/helpers/protobuf', () => ({
  createMessageBuffer: jest.fn(() => new Uint8Array([1, 2, 3])),
  decodeMessageBuffer: jest.fn(() => ({})),
}));

// iStartupConfig reads these at module load when natsService is imported.
// Snapshot the pristine env first and restore in afterAll so these worker-global overrides
// do not leak into later test files.
const ORIGINAL_ENV = { ...process.env };
process.env.NODE_ENV = 'test';
process.env.SERVER_URL = '0.0.0.0:4222';
process.env.FUNCTION_NAME = 'test-function';

import * as nats from 'nats';
import { NatsService } from '../src/services/natsService';
import { startupConfig } from '../src/interfaces/iStartupConfig';

const fakeNats = (): {
  __broker: { connectShouldFail: boolean; published: Array<{ subject: string; data: Uint8Array }>; subscriptions: unknown[] };
  __reset: () => void;
} =>
  nats as unknown as {
    __broker: { connectShouldFail: boolean; published: Array<{ subject: string; data: Uint8Array }>; subscriptions: unknown[] };
    __reset: () => void;
  };

const broker = (): ReturnType<typeof fakeNats>['__broker'] => fakeNats().__broker;

const logger: ILoggerService = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

let savedProducer: string;
let savedServerUrl: string;
let savedFunctionName: string;

beforeEach(() => {
  fakeNats().__reset();
  savedProducer = startupConfig.producerStreamName;
  savedServerUrl = startupConfig.serverUrl;
  savedFunctionName = startupConfig.functionName;
});

afterEach(() => {
  startupConfig.producerStreamName = savedProducer;
  startupConfig.serverUrl = savedServerUrl;
  startupConfig.functionName = savedFunctionName;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('validateEnvironment - producer stream optional (#281)', () => {
  it('does not throw when no producer stream is configured', () => {
    const svc = new NatsService();
    startupConfig.producerStreamName = '';

    expect(() => svc.validateEnvironment()).not.toThrow();
  });

  it('still throws when SERVER_URL is missing', () => {
    const svc = new NatsService();
    startupConfig.producerStreamName = '';
    startupConfig.serverUrl = '';

    expect(() => svc.validateEnvironment()).toThrow(/Server URL/i);
  });

  it('still throws when FUNCTION_NAME is missing', () => {
    const svc = new NatsService();
    startupConfig.producerStreamName = '';
    startupConfig.functionName = '';

    expect(() => svc.validateEnvironment()).toThrow(/Function Name/i);
  });
});

describe('handleResponse routing - run-time destinations (#281)', () => {
  it('publishes to explicit subjects with no producer stream configured', async () => {
    const svc = new NatsService();
    await svc.initServiceChannelProducer(logger); // establishes NatsConn without the producer gate
    svc.producerStreamName = '';

    await svc.handleResponse({ transaction: {} }, ['sub-rule-901', 'sub-rule-902']);

    expect(broker().published.map((p) => p.subject)).toEqual(['sub-rule-901', 'sub-rule-902']);
  });

  it('fails loudly on the default path when no producer stream is configured', async () => {
    const svc = new NatsService();
    await svc.initServiceChannelProducer(logger);
    svc.producerStreamName = '';

    await expect(svc.handleResponse({ transaction: {} })).rejects.toThrow(/producer|PRODUCER_STREAM|destination/i);
    expect(broker().published).toHaveLength(0);
  });

  it('publishes to the configured producer stream on the default path', async () => {
    const svc = new NatsService();
    await svc.initServiceChannelProducer(logger);
    svc.producerStreamName = 'RuleResponse';

    await svc.handleResponse({ transaction: {} });

    expect(broker().published).toHaveLength(1);
    expect(broker().published[0].subject).toBe('RuleResponse');
  });

  it('publishes to explicit subjects only, not the producer stream, when both are set', async () => {
    const svc = new NatsService();
    await svc.initServiceChannelProducer(logger);
    svc.producerStreamName = 'RuleResponse';

    await svc.handleResponse({ transaction: {} }, ['sub-rule-901']);

    expect(broker().published.map((p) => p.subject)).toEqual(['sub-rule-901']);
  });

  it('treats an empty subject array as the default path', async () => {
    const svc = new NatsService();
    await svc.initServiceChannelProducer(logger);
    svc.producerStreamName = 'RuleResponse';

    await svc.handleResponse({ transaction: {} }, []);

    expect(broker().published.map((p) => p.subject)).toEqual(['RuleResponse']);
  });

  it('does not publish when there is no connection (explicit subjects)', async () => {
    const svc = new NatsService();
    svc.producerStreamName = 'RuleResponse';
    // no NatsConn established

    await expect(svc.handleResponse({ transaction: {} }, ['sub-a'])).resolves.toBeUndefined();
    expect(broker().published).toHaveLength(0);
  });

  it('is a no-op on the default path when there is no connection (NatsConn checked before producer)', async () => {
    const svc = new NatsService();
    svc.producerStreamName = '';
    // no NatsConn established - must return before the loud default-path throw

    await expect(svc.handleResponse({ transaction: {} })).resolves.toBeUndefined();
    expect(broker().published).toHaveLength(0);
  });
});

describe('subscribe - default-path failure is logged, not left unhandled (#281)', () => {
  it('logs an error when a response-callback default-path publish fails', async () => {
    const svc = new NatsService();
    await svc.initServiceChannelProducer(logger); // establishes NatsConn
    svc.logger = logger;
    svc.producerStreamName = ''; // default path will fail loudly

    const conn = svc.NatsConn as unknown as {
      subscribe: (subject: string) => never;
      publish: (subject: string, data: Uint8Array) => void;
    };
    const subscription = conn.subscribe('consume-me');

    // Fire-and-forget the consume loop; its response callback hits the no-subject default path.
    const pump = svc.subscribe(subscription, ((_message: unknown, respond: (msg: object) => void) => {
      respond({ transaction: {} });
    }) as never);

    conn.publish('consume-me', new Uint8Array([1]));

    // Let the async iterator deliver the message and the catch handler run.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(logger.error as jest.Mock).toHaveBeenCalled();
    expect(broker().published.find((p) => p.subject === 'RuleResponse')).toBeUndefined();

    (subscription as unknown as { unsubscribe: () => void }).unsubscribe();
    await pump;
  });
});
