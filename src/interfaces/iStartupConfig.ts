import path from 'path';
import { config as dotenv } from 'dotenv';
import { RetentionPolicy } from 'nats';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv({
  path: path.resolve(__dirname, '../.env'),
});

export interface IStartupConfig {
  ackPolicy: 'None' | 'All' | 'Explicit' | 'NotSet';
  /**
   *Could be either "Memory" or "File"
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  producerStorage: string;
  producerStreamName: string;
  /**
   *Could be "Workqueue", "Interest" or "Limits"
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  producerRetentionPolicy: string;
  consumerStreamName: string;

  /**
   *parseInt(process.env.ITERATIONS!, 10) || 1000
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  serverUrl: string;

  /**
   *iterations: parseInt(process.env.ITERATIONS!, 10) || 1000
   *
   * @type {number}
   * @memberof IStartupConfig
   */
  iterations: number;
  /**
   *env: <string>process.env.NODE_ENV
   *
   * @type {string}
   * @memberof IStartupConfig
   * @requires
   */
  env: string;

  /**
   *functionName: <string>process.env.FUNCTION_NAME
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  functionName: string;

  /**
   *functionName: <string>process.env.STREAM_SUBJECT
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  streamSubject: string;

  /**
   *delay: parseInt(process.env.DELAY!, 10) || 100
   *
   * @type {number}
   * @memberof IStartupConfig
   */
  delay: number;
}

export const startupConfig: IStartupConfig = {
  iterations: parseInt(process.env.ITERATIONS!, 10) || 1000,
  env: process.env.NODE_ENV as string,
  serverUrl: process.env.SERVER_URL as string,
  functionName: process.env.FUNCTION_NAME as string,
  delay: parseInt(process.env.DELAY!, 10) || 100,
  producerStreamName: process.env.PRODUCER_STREAM as string,
  consumerStreamName: process.env.CONSUMER_STREAM as string,
  streamSubject: process.env.STREAM_SUBJECT as string,
  producerRetentionPolicy: process.env.FUNCTION_NAME as string,
  ackPolicy: (process.env.ACK_POLICY as 'None' | 'All' | 'Explicit' | 'NotSet') || 'None',
  producerStorage: (process.env.PRODUCER_STORAGE as string) || '',
};
