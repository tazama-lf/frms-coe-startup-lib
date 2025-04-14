import { Storage } from '@google-cloud/storage';
import FRMSMessage from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import { randomUUID } from 'crypto';
import { type ILoggerService } from '../interfaces';
import { relayConfig } from '../interfaces/iRelayConfig';
import { type IRelay } from '../interfaces/iRelayService';
import { startupConfig } from '../interfaces/iStartupConfig';
import { getLogger } from '../utils';

export class GoogleRelay implements IRelay {
  private logger?: ILoggerService | Console;
  private client?: Storage;
  private readonly config = relayConfig;

  async init(loggerService?: ILoggerService): Promise<void> {
    this.logger = getLogger(startupConfig, loggerService);
    this.client = new Storage();
  }

  async relay(data: Uint8Array): Promise<void> {
    try {
      const decodedMessage = FRMSMessage.decode(data);
      const messageObject = FRMSMessage.toObject(decodedMessage);
      const messageString = JSON.stringify(messageObject);

      const bucket = this.client!.bucket(this.config.bucketName!);
      const file = bucket.file(`reports/${randomUUID()}.json`);

      await file.save(messageString, {
        metadata: { contentType: 'application/json' },
      });
      this.logger?.log('[TRS]: File Successfuly saved to google cloud bucket.');
    } catch (error) {
      this.logger?.error(`[TRS]: Error when trying to save file to Google Cloud Bucket. ${JSON.stringify(error)}`);
    }
  }
}
