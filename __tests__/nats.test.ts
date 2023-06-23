// redis and aragojs is mocked
// setup.jest.js

import { init } from '../lib';
import { responseCallback } from '../lib/types/onMessageFunction';

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

  it('handleTransaction Should have been called', async () => {
    
    async function handleTransaction(reqObj: string, handleResponse: responseCallback): Promise<void> {
      // Do stuff
      const req = JSON.parse(reqObj);
      req.Test = { some: 'val', another: 'one' };
      const resp = JSON.stringify(req);
      
      // Done, so call response method
      handleResponse(resp);
    }
    
    const runServer = async (): Promise<void> => {
      for (let retryCount = 0; retryCount < 10; retryCount++) {
        if (!(await init(handleTransaction))) await new Promise((resolve) => setTimeout(resolve, 5000));
        else break;
      }
    };

    expect(handleTransaction).toBeDefined();
  });
});
