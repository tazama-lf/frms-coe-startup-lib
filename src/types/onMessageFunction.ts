export type onMessageFunction = (reqObj: string, handleResponse: responseCallback) => Promise<void>;
export type responseCallback = (response: string) => Promise<void>;
