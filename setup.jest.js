// SPDX-License-Identifier: Apache-2.0

// Use mock nats instead of actual in jest
const natsjs = jest.requireActual('nats');

/**
 * No-op replacement for `nats.connect` used in Jest tests.
 *
 * Intentionally performs no operation so the `nats` module can be mocked without opening real connections.
 */
function connect() {}

const MockNatsjs = { ...natsjs, connect };

jest.mock('nats', () => MockNatsjs);