export type onMessageFunction = (reqObj: unknown, handleResponse: responseCallback) => Promise<void>;
export type responseCallback = (response: unknown, subject: string[]) => Promise<void>;
