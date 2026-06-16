// SPDX-License-Identifier: Apache-2.0

import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv({
  path: path.resolve(__dirname, '../.env'),
});

export interface IStartupConfig {
  /**
   *The transport used to start the service. Always 'nats'; the JetStream transport has been removed.
   *
   * @type {'nats'}
   * @memberof IStartupConfig
   */
  startupType: 'nats';
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
  // STARTUP_TYPE is no longer read: the library only supports the NATS transport.
  startupType: 'nats',
  env: validateEnvVar('NODE_ENV', 'string').toString(),
  serverUrl: validateEnvVar('SERVER_URL', 'string').toString(),
  functionName: validateEnvVar('FUNCTION_NAME', 'string').toString(),
  producerStreamName: validateEnvVar('PRODUCER_STREAM', 'string', true).toString(),
  consumerStreamName: validateEnvVar('CONSUMER_STREAM', 'string', true).toString(),
  streamSubject: validateEnvVar('STREAM_SUBJECT', 'string', true).toString(),
  producerRetentionPolicy: (process.env.PRODUCER_RETENTION_POLICY as 'Limits' | 'Interest' | 'Workqueue') || 'Workqueue',
  ackPolicy: (process.env.ACK_POLICY as 'All' | 'Explicit') || 'Explicit',
  producerStorage: (process.env.PRODUCER_STORAGE as 'File' | 'Memory') || 'Memory',
};
