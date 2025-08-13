import { relayConfig } from '../interfaces/iRelayConfig';
import type { IRelay } from '../interfaces/iRelayService';
import http from 'node:http';
import https from 'node:https';
import FRMSMessage from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import axios from 'axios';
import type { ILoggerService } from '../interfaces';
import { validateEnvVar } from '@tazama-lf/frms-coe-lib/lib/config';
import { startupConfig } from '../interfaces/iStartupConfig';
import { getLogger } from '../utils';

export class RestRelay implements IRelay {
  private readonly config = relayConfig;
  private httpAgent?: http.Agent;
  private httpsAgent?: https.Agent;
  private logger?: ILoggerService | Console;
  private jsonPayload?: boolean;

  async init(loggerService?: ILoggerService): Promise<void> {
    this.logger = getLogger(startupConfig, loggerService);

    const sockets = Number(validateEnvVar('MAX_SOCKETS', 'number'));
    this.jsonPayload = Boolean(validateEnvVar('JSON_PAYLOAD', 'boolean'));
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: Number(sockets) });
    this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: Number(sockets) });
  }
  async relay(data: Uint8Array): Promise<void> {
    try {
      const agent = { httpAgent: this.httpAgent, httpsAgent: this.httpsAgent };
      if (this.jsonPayload) {
        const decodedMessage = FRMSMessage.decode(data);
        const messageObject = FRMSMessage.toObject(decodedMessage);
        await axios.post(this.config.destinationUrl, { messageObject }, agent);
      } else {
        await axios.post(this.config.destinationUrl, { message: data }, agent);
      }
      this.logger?.log('Message relayed to REST API');
    } catch (error) {
      this.logger?.error(`Error relaying to REST API ${JSON.stringify(error)}`);
    }
  }
}