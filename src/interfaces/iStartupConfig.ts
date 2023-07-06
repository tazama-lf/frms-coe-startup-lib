import { config as dotenv } from 'dotenv';
import path from 'path';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv({
  path: path.resolve(__dirname, '../.env'),
});

export interface IStartupConfig {
  /**
   *Configure the service type that should be started up, eg, Nats = 'nats' or Jetstream = 'jetstream'
   *
   * @type {('nats' | 'jetstream')}
   * @memberof IStartupConfig
   */
  startupType: 'nats' | 'jetstream';
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
}

export const startupConfig: IStartupConfig = {
  startupType: process.env.STARTUP_TYPE as 'nats' | 'jetstream',
  env: process.env.NODE_ENV as string,
  serverUrl: process.env.SERVER_URL as string,
  functionName: process.env.FUNCTION_NAME as string,
  producerStreamName: process.env.PRODUCER_STREAM as string,
  consumerStreamName: process.env.CONSUMER_STREAM as string,
  streamSubject: process.env.STREAM_SUBJECT as string,
  producerRetentionPolicy: (process.env.PRODUCER_RETENTION_POLICY as 'Limits' | 'Interest' | 'Workqueue') || 'Workqueue',
  ackPolicy: (process.env.ACK_POLICY as 'All' | 'Explicit') || 'Explicit',
  producerStorage: (process.env.PRODUCER_STORAGE as 'File' | 'Memory') || 'Memory',
};
