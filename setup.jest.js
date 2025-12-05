// SPDX-License-Identifier: Apache-2.0

// Use mock nats instead of actual in jest
const natsjs = jest.requireActual('nats');

function connect() {}

const MockNatsjs = { ...natsjs, connect };

jest.mock('nats', () => MockNatsjs);
