export type onMessageFunction = (reqObj: string, handleResponse: responseCallback) => Promise<void>;
export type responseCallback = (response: string, subject: string[]) => Promise<void>;
