// SPDX-License-Identifier: Apache-2.0

import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';
import { startupConfig } from './iStartupConfig';

export interface IRelayConfig {
  destinationType: 'nats' | 'rabbitmq' | 'rest';
  destinationUrl: string;
  producerStream: string;
  bucketName?: string;
  googleApplicationCredentials?: string;
  tableId?: string;
  datasetId?: string;
}

export const relayConfig: IRelayConfig = {
  destinationType: validateEnvVar('DESTINATION_TYPE', 'string').toString() as 'nats' | 'rabbitmq' | 'rest',
  destinationUrl: validateEnvVar('DESTINATION_URL', 'string').toString(),
  producerStream: startupConfig.producerStreamName,
  bucketName: validateEnvVar('GOOGLE_BUCKET_NAME', 'string', true).toString(),
  googleApplicationCredentials: validateEnvVar('GOOGLE_APPLICATION_CREDENTIALS', 'string', true).toString(),
  tableId: validateEnvVar('TABLE_ID', 'string', true).toString(),
  datasetId: validateEnvVar('DATASET_ID', 'string', true).toString(),
};