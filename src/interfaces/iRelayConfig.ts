// SPDX-License-Identifier: Apache-2.0

import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';
import { startupConfig } from './iStartupConfig';

export interface IRelayConfig {
  destinationType: 'nats' | 'rabbitmq' | 'rest';
  destinationUrl: string;
  producerStream: string;
  bucketName?: string;
  googleApplicationCredentials?: string;
}

export const relayConfig: IRelayConfig = {
  destinationType: validateEnvVar('DESTINATION_TYPE', 'string'),
  destinationUrl: validateEnvVar('DESTINATION_URL', 'string'),
  producerStream: startupConfig.producerStreamName,
  bucketName: validateEnvVar('GOOGLE_BUCKET_NAME', 'string', true),
  googleApplicationCredentials: validateEnvVar('GOOGLE_APPLICATION_CREDENTIALS', 'string', true),
};
