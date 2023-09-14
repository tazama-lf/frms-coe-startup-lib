export type onMessageFunction = (reqObj: unknown, handleResponse: responseCallback) => Promise<void>;
export type responseCallback = (response: object, subject: string[]) => Promise<void>;
