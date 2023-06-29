import { init } from '.';
import { type responseCallback } from './types/onMessageFunction';

const runServer = async (): Promise<void> => {
  for (let retryCount = 0; retryCount < 10; retryCount++) {
    if (!(await init(handleTransaction))) await new Promise((resolve) => setTimeout(resolve, 5000));
    else break;
  }
};

async function handleTransaction(reqObj: string, handleResponse: responseCallback): Promise<void> {
  // Do stuff
  const req = JSON.parse(reqObj);
  req.Test = { some: 'val', another: 'one' };
  const resp = JSON.stringify(req);

  // Done, so call response method
  handleResponse(resp, []);
}
