// SPDX-License-Identifier: Apache-2.0

// Red-first tests for the service-channel config surface (frms-coe-startup-lib#279, Part B).
// startupConfig is a module-load singleton, so each case sets process.env and
// re-imports iStartupConfig inside jest.isolateModules to get a fresh read.
// These encode AC#5 (the new transport-agnostic vars) and AC#6 (the /-free
// FUNCTION_NAME guard adopted from frms-coe-lib's validateFunctionName()).

const BASE_ENV = {
  NODE_ENV: 'test',
  SERVER_URL: '0.0.0.0:4222',
  FUNCTION_NAME: 'test-function',
};

const ORIGINAL_ENV = { ...process.env };

// The service-channel fields Part B must add to IStartupConfig. Declared here so
// these red tests compile and fail at the assertion level (the fields are
// undefined at runtime) rather than failing to compile.
type ServiceChannelConfig = import('../src/interfaces/iStartupConfig').IStartupConfig & {
  serviceChannelProducer: string;
  serviceChannelConsumer: string;
  serviceChannelSourceUriPrefix: string;
};

const loadConfig = (overrides: Record<string, string | undefined>): typeof import('../src/interfaces/iStartupConfig') => {
  let mod: typeof import('../src/interfaces/iStartupConfig') | undefined;
  jest.isolateModules(() => {
    process.env = { ...ORIGINAL_ENV, ...BASE_ENV };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    mod = require('../src/interfaces/iStartupConfig');
  });
  if (!mod) throw new Error('iStartupConfig failed to load');
  return mod;
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('FUNCTION_NAME /-free guard via validateFunctionName (AC#6)', () => {
  it('throws when FUNCTION_NAME contains a path separator', () => {
    expect(() => loadConfig({ FUNCTION_NAME: 'bad/name' })).toThrow();
  });

  it('accepts a dotted / versioned FUNCTION_NAME', () => {
    const { startupConfig } = loadConfig({ FUNCTION_NAME: 'typology-001@1.0.0' });
    expect(startupConfig.functionName).toBe('typology-001@1.0.0');
  });
});

describe('service-channel config vars (AC#5)', () => {
  it('exposes SERVICE_CHANNEL_PRODUCER / SERVICE_CHANNEL_CONSUMER when set', () => {
    const { startupConfig } = loadConfig({
      SERVICE_CHANNEL_PRODUCER: 'svc.forward',
      SERVICE_CHANNEL_CONSUMER: 'svc.reply',
    });
    const cfg = startupConfig as ServiceChannelConfig;
    expect(cfg.serviceChannelProducer).toBe('svc.forward');
    expect(cfg.serviceChannelConsumer).toBe('svc.reply');
  });

  it('treats SERVICE_CHANNEL_PRODUCER / CONSUMER as optional (config still loads when absent)', () => {
    const { startupConfig } = loadConfig({
      SERVICE_CHANNEL_PRODUCER: undefined,
      SERVICE_CHANNEL_CONSUMER: undefined,
    });
    const cfg = startupConfig as ServiceChannelConfig;
    expect(cfg.serviceChannelProducer).toBe('');
    expect(cfg.serviceChannelConsumer).toBe('');
  });

  it('defaults SERVICE_CHANNEL_SOURCE_URI_PREFIX to empty string when absent', () => {
    const { startupConfig } = loadConfig({ SERVICE_CHANNEL_SOURCE_URI_PREFIX: undefined });
    expect((startupConfig as ServiceChannelConfig).serviceChannelSourceUriPrefix).toBe('');
  });

  it('reads SERVICE_CHANNEL_SOURCE_URI_PREFIX when set', () => {
    const { startupConfig } = loadConfig({ SERVICE_CHANNEL_SOURCE_URI_PREFIX: 'https://acme.example/' });
    expect((startupConfig as ServiceChannelConfig).serviceChannelSourceUriPrefix).toBe('https://acme.example/');
  });
});
