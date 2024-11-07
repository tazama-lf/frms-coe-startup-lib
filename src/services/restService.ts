import FRMSMessage from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import { type IRelay } from '../interfaces/iRelayService';
import axios from 'axios';
import http from 'http';
import https from 'https';
import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';

export class RabbitMQ implements IRelay {
  private readonly destinationUrl: string;
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;
  private readonly jsonPayload: boolean;

  constructor() {
    this.destinationUrl = validateEnvVar('RELAY_DESTINATION_URL', 'string');
    const maxSockets = validateEnvVar('RELAY_MAX_SOCKETS', 'number');
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: Number(maxSockets) });
    this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: Number(maxSockets) });
    this.jsonPayload = validateEnvVar('RELAY_JSON_PAYLOAD', 'boolean');
  }

  async relay(data: Uint8Array): Promise<void> {
    const opts = { httpAgent: this.httpAgent, httpsAgent: this.httpsAgent };
    if (this.jsonPayload) {
      const decodedMessage = FRMSMessage.decode(data);
      const messageObject = FRMSMessage.toObject(decodedMessage);
      await axios.post(this.destinationUrl, { messageObject }, opts);
    } else {
      await axios.post(this.destinationUrl, { message: data }, opts);
    }
  }
}
