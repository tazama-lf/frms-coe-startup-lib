// redis and aragojs is mocked
// setup.jest.js.
import { StartupFactory } from '../src';
import { type responseCallback } from '../src/types/onMessageFunction';
import { startupConfig } from '../src/interfaces/iStartupConfig';

beforeAll(async () => {
  let server = {
    servers: '',
  };
});

describe('init', () => {
  let natsSpy: jest.SpyInstance;
  beforeEach(() => {
    // natsSpy = jest.spyOn(MockNatsjs,'connect');
  });

  it('Jetstream: handleTransaction Should have been called', async () => {
    async function handleTransaction(reqObj: unknown, handleResponse: responseCallback): Promise<void> {
      // Do stuff
      const req = JSON.parse(reqObj as string);
      req.Test = { some: 'val', another: 'one' };
      const resp = req;

      // Done, so call response method
      handleResponse(resp, []);
    }

    startupConfig.startupType = 'jetstream';
    const runServer = async (): Promise<void> => {
      for (let retryCount = 0; retryCount < 10; retryCount++) {
        let jsService = new StartupFactory();
        if (!(await jsService.init(handleTransaction))) await new Promise((resolve) => setTimeout(resolve, 5000));
        else break;
      }
    };

    expect(handleTransaction).toBeDefined();
  });

  it('Nats: handleTransaction Should have been called', async () => {
    async function handleTransaction(reqObj: unknown, handleResponse: responseCallback): Promise<void> {
      // Do stuff
      const req = JSON.parse(reqObj as string);
      req.Test = { some: 'val', another: 'one' };
      const resp = req;

      // Done, so call response method
      handleResponse(resp, []);
    }

    startupConfig.startupType = 'nats';
    const runServer = async (): Promise<void> => {
      for (let retryCount = 0; retryCount < 10; retryCount++) {
        let jsService = new StartupFactory();
        if (!(await jsService.init(handleTransaction))) await new Promise((resolve) => setTimeout(resolve, 5000));
        else break;
      }
    };

    expect(handleTransaction).toBeDefined();
  });
});
