// SPDX-License-Identifier: Apache-2.0

import { config as dotenv } from 'dotenv';
import path from 'node:path';
import { validateEnvVar, validateFunctionName } from '@tazama-lf/frms-coe-lib/lib/config';

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

  /**
   *The subject this service publishes service-channel messages to (`SERVICE_CHANNEL_PRODUCER`).
   *Optional at load; enforced required-when-used at service-channel init.
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  serviceChannelProducer: string;

  /**
   *The subject this service subscribes to for service-channel messages (`SERVICE_CHANNEL_CONSUMER`).
   *Optional at load; enforced required-when-used at service-channel init.
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  serviceChannelConsumer: string;

  /**
   *Deployment-wide `source`-URI prefix concatenated verbatim with `/`-free `FUNCTION_NAME` to
   *compose the CloudEvents `source` (`SERVICE_CHANNEL_SOURCE_URI_PREFIX`). Defaults to `''`.
   *
   * @type {string}
   * @memberof IStartupConfig
   */
  serviceChannelSourceUriPrefix: string;
}

export const startupConfig: IStartupConfig = {
  // STARTUP_TYPE is no longer read: the library only supports the NATS transport.
  startupType: 'nats',
  env: validateEnvVar('NODE_ENV', 'string').toString(),
  serverUrl: validateEnvVar('SERVER_URL', 'string').toString(),
  functionName: validateFunctionName(),
  producerStreamName: validateEnvVar('PRODUCER_STREAM', 'string', true).toString(),
  consumerStreamName: validateEnvVar('CONSUMER_STREAM', 'string', true).toString(),
  streamSubject: validateEnvVar('STREAM_SUBJECT', 'string', true).toString(),
  serviceChannelProducer: validateEnvVar('SERVICE_CHANNEL_PRODUCER', 'string', true).toString(),
  serviceChannelConsumer: validateEnvVar('SERVICE_CHANNEL_CONSUMER', 'string', true).toString(),
  serviceChannelSourceUriPrefix: validateEnvVar('SERVICE_CHANNEL_SOURCE_URI_PREFIX', 'string', true).toString(),
  producerRetentionPolicy: (process.env.PRODUCER_RETENTION_POLICY as 'Limits' | 'Interest' | 'Workqueue') || 'Workqueue',
  ackPolicy: (process.env.ACK_POLICY as 'All' | 'Explicit') || 'Explicit',
  producerStorage: (process.env.PRODUCER_STORAGE as 'File' | 'Memory') || 'Memory',
};

// Anti-echo guard: a service must never publish to the same subject it consumes, or it delivers its
// own service-channel messages straight back to itself. The producer/consumer split is the
// load-bearing invariant of the service channel; enforce it at config load so a misconfiguration
// fails fast at startup rather than silently self-echoing at runtime. Only fires when both subjects
// are configured (both are optional-when-absent).
if (
  startupConfig.serviceChannelProducer &&
  startupConfig.serviceChannelConsumer &&
  startupConfig.serviceChannelProducer === startupConfig.serviceChannelConsumer
) {
  throw new Error(
    `SERVICE_CHANNEL_PRODUCER and SERVICE_CHANNEL_CONSUMER must differ to avoid self-delivery; both are set to '${startupConfig.serviceChannelProducer}'.`,
  );
}
