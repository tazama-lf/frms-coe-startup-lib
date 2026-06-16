// SPDX-License-Identifier: Apache-2.0

// Controllable in-memory fake of the nats core API for the service-channel tests.
// A single shared broker is held across every connection so that multiple
// subscribers on one subject fan-out exactly like a real NATS server - which is
// what the no-queue-group broadcast proof (AC#4) needs to assert.

export interface FakeMsg {
  subject: string;
  data: Uint8Array;
  sid: number;
}

class FakeSubscription {
  readonly subject: string;
  readonly opts?: { queue?: string };
  closed = false;
  private readonly pending: FakeMsg[] = [];
  private readonly waiters: Array<(r: IteratorResult<FakeMsg>) => void> = [];

  constructor(subject: string, opts?: { queue?: string }) {
    this.subject = subject;
    this.opts = opts;
  }

  deliver(msg: FakeMsg): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: msg, done: false });
    } else {
      this.pending.push(msg);
    }
  }

  unsubscribe(): void {
    this.closed = true;
    while (this.waiters.length) {
      this.waiters.shift()!({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<FakeMsg> {
    return {
      next: (): Promise<IteratorResult<FakeMsg>> => {
        const msg = this.pending.shift();
        if (msg) return Promise.resolve({ value: msg, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

class FakeBroker {
  connectShouldFail = false;
  published: FakeMsg[] = [];
  subscriptions: FakeSubscription[] = [];
  private sid = 0;

  publish(subject: string, data: Uint8Array): void {
    const msg: FakeMsg = { subject, data, sid: ++this.sid };
    this.published.push(msg);
    for (const sub of this.subscriptions) {
      if (!sub.closed && sub.subject === subject) sub.deliver(msg);
    }
  }

  subscribe(subject: string, opts?: { queue?: string }): FakeSubscription {
    const sub = new FakeSubscription(subject, opts);
    this.subscriptions.push(sub);
    return sub;
  }

  reset(): void {
    this.connectShouldFail = false;
    this.published = [];
    this.subscriptions = [];
    this.sid = 0;
  }
}

class FakeConnection {
  private closedResolve!: () => void;
  private readonly closedPromise: Promise<void>;

  constructor(private readonly broker: FakeBroker) {
    this.closedPromise = new Promise((resolve) => {
      this.closedResolve = resolve;
    });
  }

  getServer(): string {
    return 'fake-nats:4222';
  }

  publish(subject: string, data: Uint8Array): void {
    this.broker.publish(subject, data);
  }

  subscribe(subject: string, opts?: { queue?: string }): FakeSubscription {
    return this.broker.subscribe(subject, opts);
  }

  closed(): Promise<void> {
    return this.closedPromise;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- mirrors the async nats drain() signature
  async drain(): Promise<void> {
    this.closedResolve();
  }
}

export function makeFakeNats(): Record<string, unknown> {
  const actual = jest.requireActual('nats') as Record<string, unknown>;
  const broker = new FakeBroker();

  // eslint-disable-next-line @typescript-eslint/require-await -- mirrors the async nats connect() signature
  const connectImpl = async (): Promise<FakeConnection> => {
    if (broker.connectShouldFail) throw new Error('simulated connect failure');
    return new FakeConnection(broker);
  };
  const connect = jest.fn(connectImpl);

  return {
    ...actual,
    connect,
    __broker: broker,
    // jest's `resetMocks: true` strips the implementation before each test, so __reset (called from
    // each suite's beforeEach) both clears broker state and re-installs the connect implementation.
    __reset: (): void => {
      broker.reset();
      connect.mockReset();
      connect.mockImplementation(connectImpl);
    },
  };
}
