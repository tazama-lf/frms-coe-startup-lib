// SPDX-License-Identifier: Apache-2.0

import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';
import { startupConfig } from './iStartupConfig';

export interface IRelayConfig {
  destinationType: 'nats' | 'rabbitmq' | 'rest';
  destinationUrl: string;
  producerStream: string;
  /** TLS settings for the downstream NATS server, independent of startup NATS settings. */
  natsAuthenticated: boolean;
  natsCertificateAuthorityPath: string;
  natsClientCertPath: string;
  natsClientKeyPath: string;
  bucketName?: string;
  googleApplicationCredentials?: string;
  tableId?: string;
  datasetId?: string;
}

export const relayConfig: IRelayConfig = {
  destinationType: validateEnvVar('DESTINATION_TYPE', 'string').toString() as 'nats' | 'rabbitmq' | 'rest',
  destinationUrl: validateEnvVar('DESTINATION_URL', 'string').toString(),
  producerStream: startupConfig.producerStreamName,
  natsAuthenticated: validateEnvVar('DESTINATION_NATS_AUTHENTICATED', 'boolean', true) === true,
  natsCertificateAuthorityPath: validateEnvVar('DESTINATION_NATS_CERTIFICATE_AUTHORITY_PATH', 'string', true).toString(),
  natsClientCertPath: validateEnvVar('DESTINATION_NATS_CLIENT_CERT_PATH', 'string', true).toString(),
  natsClientKeyPath: validateEnvVar('DESTINATION_NATS_CLIENT_KEY_PATH', 'string', true).toString(),
  bucketName: validateEnvVar('GOOGLE_BUCKET_NAME', 'string', true).toString(),
  googleApplicationCredentials: validateEnvVar('GOOGLE_APPLICATION_CREDENTIALS', 'string', true).toString(),
  tableId: validateEnvVar('TABLE_ID', 'string', true).toString(),
  datasetId: validateEnvVar('DATASET_ID', 'string', true).toString(),
};
