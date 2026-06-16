// SPDX-License-Identifier: Apache-2.0

// nats is mocked in setup.jest.js.
//
// These tests encode the post-hardening contract for issue #276:
//   - the factory always selects NatsService (the single supported transport);
//   - STARTUP_TYPE is inert: unset, garbage, and the decommissioned 'jetstream'
//     value all resolve to nats without throwing at config import;
//   - the StartupFactory switch carries a default arm that yields NatsService for
//     any non-'nats' startupType (defence-in-depth).
//
// startupConfig is a module-load singleton. The env-path cases set process.env
// before a dynamic require inside jest.isolateModules. The default-arm cases use
// jest.doMock (scoped to the isolate block) to feed the factory a non-'nats'
// startupType directly, since once STARTUP_TYPE is no longer read the env can no
// longer reach the default arm. In every case StartupFactory and NatsService are
// pulled from the SAME isolated registry so the instanceof identity check holds.

type IsolatedModules = {
  StartupFactory: typeof import('../src').StartupFactory;
  NatsService: typeof import('../src/services/natsService').NatsService;
};

const ORIGINAL_ENV = { ...process.env };

const loadViaEnv = (startupType?: string): IsolatedModules => {
  let modules: IsolatedModules | undefined;
  jest.isolateModules(() => {
    // Required vars read by iStartupConfig at module load; set so the import
    // only ever fails because of STARTUP_TYPE, never an unrelated missing var.
    process.env.NODE_ENV = 'test';
    process.env.SERVER_URL = '0.0.0.0:4222';
    process.env.FUNCTION_NAME = 'test-function';

    if (startupType === undefined) {
      delete process.env.STARTUP_TYPE;
    } else {
      process.env.STARTUP_TYPE = startupType;
    }

    const { StartupFactory } = require('../src');
    const { NatsService } = require('../src/services/natsService');
    modules = { StartupFactory, NatsService };
  });

  if (!modules) {
    throw new Error('Isolated modules failed to load');
  }
  return modules;
};

const loadWithStartupType = (startupType: string): IsolatedModules => {
  let modules: IsolatedModules | undefined;
  jest.isolateModules(() => {
    jest.doMock('../src/interfaces/iStartupConfig', () => ({
      startupConfig: {
        startupType,
        serverUrl: '0.0.0.0:4222',
        functionName: 'test-function',
      },
    }));

    const { StartupFactory } = require('../src');
    const { NatsService } = require('../src/services/natsService');
    modules = { StartupFactory, NatsService };
  });

  jest.dontMock('../src/interfaces/iStartupConfig');

  if (!modules) {
    throw new Error('Isolated modules failed to load');
  }
  return modules;
};

afterEach(() => {
  // Restore the full env so SERVER_URL/FUNCTION_NAME/NODE_ENV/STARTUP_TYPE set
  // during a load do not leak into other tests or suites.
  process.env = { ...ORIGINAL_ENV };
});

describe('StartupFactory transport selection (STARTUP_TYPE is inert)', () => {
  it('selects NatsService when STARTUP_TYPE is nats', () => {
    const { StartupFactory, NatsService } = loadViaEnv('nats');
    expect(new StartupFactory().startupService).toBeInstanceOf(NatsService);
  });

  it('does not throw and defaults to NatsService when STARTUP_TYPE is unset', () => {
    expect(() => loadViaEnv(undefined)).not.toThrow();

    const { StartupFactory, NatsService } = loadViaEnv(undefined);
    expect(new StartupFactory().startupService).toBeInstanceOf(NatsService);
  });

  it('resolves to NatsService for an unknown STARTUP_TYPE value', () => {
    const { StartupFactory, NatsService } = loadViaEnv('totally-bogus-value');
    expect(new StartupFactory().startupService).toBeInstanceOf(NatsService);
  });

  it('resolves to NatsService for the decommissioned jetstream value', () => {
    const { StartupFactory, NatsService } = loadViaEnv('jetstream');
    expect(new StartupFactory().startupService).toBeInstanceOf(NatsService);
  });
});

describe('StartupFactory default arm (defence-in-depth)', () => {
  it('yields NatsService for a non-nats startupType', () => {
    const { StartupFactory, NatsService } = loadWithStartupType('totally-bogus-value');
    expect(new StartupFactory().startupService).toBeInstanceOf(NatsService);
  });

  it('yields NatsService for a jetstream startupType', () => {
    const { StartupFactory, NatsService } = loadWithStartupType('jetstream');
    expect(new StartupFactory().startupService).toBeInstanceOf(NatsService);
  });
});
