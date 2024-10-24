// SPDX-License-Identifier: Apache-2.0

import { config as dotenv } from 'dotenv';
import path from 'path';
import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';

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
  startupType: validateEnvVar<'nats' | 'jetstream'>('STARTUP_TYPE', 'string'),
  env: validateEnvVar<string>('NODE_ENV', 'string'),
  serverUrl: validateEnvVar<string>('SERVER_URL', 'string'),
  functionName: validateEnvVar<string>('FUNCTION_NAME', 'string'),
  producerStreamName: validateEnvVar('PRODUCER_STREAM', 'string', true),
  consumerStreamName: validateEnvVar('CONSUMER_STREAM', 'string', true),
  streamSubject: validateEnvVar<string>('STREAM_SUBJECT', 'string', true),
  producerRetentionPolicy: (process.env.PRODUCER_RETENTION_POLICY as 'Limits' | 'Interest' | 'Workqueue') || 'Workqueue',
  ackPolicy: (process.env.ACK_POLICY as 'All' | 'Explicit') || 'Explicit',
  producerStorage: (process.env.PRODUCER_STORAGE as 'File' | 'Memory') || 'Memory',
};
