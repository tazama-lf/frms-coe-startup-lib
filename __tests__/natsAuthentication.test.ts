// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ILoggerService } from '../src/interfaces';

jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe.each(['initProducer', 'initServiceChannelProducer'] as const)('%s', (initMethod) => {
  it.each([true, false])('connects exactly once with NATS_AUTHENTICATED=%s', async (authenticated) => {
    const caPath = join(__dirname, 'helpers', 'fake-ca.crt');
    const certPath = join(__dirname, 'fake-cert.crt');
    const keyPath = join(__dirname, 'helpers', 'fake-client.key');

    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      SERVER_URL: 'fake-nats:4222',
      FUNCTION_NAME: 'test-function',
      NATS_AUTHENTICATED: String(authenticated),
      NATS_CERTIFICATE_AUTHORITY_PATH: authenticated ? caPath : '/missing-ca.crt',
      NATS_CLIENT_CERT_PATH: authenticated ? certPath : '/missing-client.crt',
      NATS_CLIENT_KEY_PATH: authenticated ? keyPath : '/missing-client.key',
    };

    let service!: import('../src/services/natsService').NatsService;
    let nats!: typeof import('nats') & { __reset: () => void };
    jest.isolateModules(() => {
      nats = require('nats');
      nats.__reset();
      const { NatsService } = require('../src/services/natsService');
      service = new NatsService();
    });

    const logger: ILoggerService = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    try {
      await expect(service[initMethod](logger)).resolves.toBe(true);
      expect(nats.connect).toHaveBeenCalledTimes(1);
      expect(nats.connect).toHaveBeenCalledWith({
        servers: ['fake-nats:4222'],
        ...(authenticated
          ? {
              tls: {
                ca: readFileSync(caPath, 'utf8'),
                cert: readFileSync(certPath, 'utf8'),
                key: readFileSync(keyPath, 'utf8'),
              },
            }
          : {}),
      });
      expect(service.NatsConn?.getServer()).toBe('fake-nats:4222');
    } finally {
      await service.NatsConn?.drain();
    }
  });
});

// Exercise both connections together so TLS cannot leak between upstream and downstream.
describe.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])('upstream TLS=%s, downstream TLS=%s', (upstreamTls, downstreamTls) => {
  it('uses independent connection options and relays to the downstream server', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const directory = mkdtempSync(join(tmpdir(), 'nats-tls-'));
    const upstream = { ca: 'upstream CA', cert: 'upstream certificate', key: 'upstream key' };
    const downstream = { ca: 'downstream CA', cert: 'downstream certificate', key: 'downstream key' };
    for (const [name, options] of Object.entries({ upstream, downstream })) {
      for (const [kind, value] of Object.entries(options)) {
        writeFileSync(join(directory, `${name}-${kind}`), value);
      }
    }
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      FUNCTION_NAME: 'test-function',
      SERVER_URL: 'upstream:4222',
      PRODUCER_STREAM: 'relay.output',
      NATS_AUTHENTICATED: String(upstreamTls),
      NATS_CERTIFICATE_AUTHORITY_PATH: join(directory, 'upstream-ca'),
      NATS_CLIENT_CERT_PATH: join(directory, 'upstream-cert'),
      NATS_CLIENT_KEY_PATH: join(directory, 'upstream-key'),
      DESTINATION_TYPE: 'nats',
      DESTINATION_URL: 'downstream:4222',
      DESTINATION_NATS_AUTHENTICATED: String(downstreamTls),
      DESTINATION_NATS_CERTIFICATE_AUTHORITY_PATH: downstreamTls ? join(directory, 'downstream-ca') : '/missing-ca.crt',
      DESTINATION_NATS_CLIENT_CERT_PATH: downstreamTls ? join(directory, 'downstream-cert') : '/missing-cert.crt',
      DESTINATION_NATS_CLIENT_KEY_PATH: downstreamTls ? join(directory, 'downstream-key') : '/missing-key',
    };
    let service!: import('../src/services/natsService').NatsService;
    let relay!: import('../src/services/natsRelayService').NatsRelay;
    let nats!: typeof import('nats') & {
      __reset: () => void;
      __broker: { published: Array<{ subject: string; data: Uint8Array }> };
    };
    try {
      jest.isolateModules(() => {
        nats = require('nats');
        nats.__reset();
        const { NatsService } = require('../src/services/natsService');
        const { NatsRelay } = require('../src/services/natsRelayService');
        service = new NatsService();
        relay = new NatsRelay();
      });
      await service.initProducer();
      await relay.init();
      expect(nats.connect).toHaveBeenCalledTimes(2);
      expect(nats.connect).toHaveBeenNthCalledWith(1, {
        servers: ['upstream:4222'],
        ...(upstreamTls ? { tls: upstream } : {}),
      });
      expect(nats.connect).toHaveBeenNthCalledWith(2, {
        servers: ['downstream:4222'],
        ...(downstreamTls ? { tls: downstream } : {}),
      });
      const payload = new Uint8Array([1, 2, 3]);
      await relay.relay(payload);
      expect(nats.__broker.published).toEqual([{ subject: 'relay.output', data: payload, sid: 1 }]);
    } finally {
      await service?.NatsConn?.drain();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
