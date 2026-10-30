// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ILoggerService } from '../src/interfaces';

jest.mock('nats', () => require('./helpers/fakeNats').makeFakeNats());

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

it('connects with the configured CA, client certificate and key when NATS authentication is enabled', async () => {
  const caPath = join(__dirname, 'helpers', 'fake-ca.crt');
  const certPath = join(__dirname, 'fake-cert.crt');
  const keyPath = join(__dirname, 'helpers', 'fake-client.key');

  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    SERVER_URL: 'fake-nats:4222',
    FUNCTION_NAME: 'test-function',
    NATS_AUTHENTICATED: 'true',
    NATS_CERTIFICATE_AUTHORITY_PATH: caPath,
    NATS_CLIENT_CERT_PATH: certPath,
    NATS_CLIENT_KEY_PATH: keyPath,
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
    await expect(service.initProducer(logger)).resolves.toBe(true);
    expect(nats.connect).toHaveBeenCalledTimes(1);
    expect(nats.connect).toHaveBeenCalledWith({
      servers: ['fake-nats:4222'],
      tls: {
        ca: readFileSync(caPath, 'utf8'),
        cert: readFileSync(certPath, 'utf8'),
        key: readFileSync(keyPath, 'utf8'),
      },
    });
    expect(service.NatsConn?.getServer()).toBe('fake-nats:4222');
  } finally {
    await service.NatsConn?.drain();
  }
});
