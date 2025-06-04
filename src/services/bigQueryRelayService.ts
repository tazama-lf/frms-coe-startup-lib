import { BigQuery } from '@google-cloud/bigquery';
import FRMSMessage from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import { type ILoggerService } from '../interfaces';
import { relayConfig } from '../interfaces/iRelayConfig';
import { type IRelay } from '../interfaces/iRelayService';
import { startupConfig } from '../interfaces/iStartupConfig';
import { getLogger } from '../utils';

export class BigQueryRelay implements IRelay {
  private logger?: ILoggerService | Console;
  private bigquery?: BigQuery;
  private readonly config = relayConfig;

  async init(loggerService?: ILoggerService): Promise<void> {
    this.bigquery = new BigQuery();
    this.logger = getLogger(startupConfig, loggerService);

    if (!this.config.datasetId) {
      this.logger.warn('No Dataset configured.');
    }

    if (!this.config.tableId) {
      this.logger.warn('No Data Table configured.');
    }
  }

  async relay(data: Uint8Array): Promise<void> {
    try {
      const decodedMessage = FRMSMessage.decode(data);
      const messageObject = FRMSMessage.toObject(decodedMessage);

      messageObject.report.timestamp = new Date().toISOString(); // This is required due to a bug in the proto file, discarding this date.

      await this.bigquery!.dataset(this.config.datasetId!).table(this.config.tableId!).insert(messageObject);

      this.logger?.log('[TRS]: Record inserted into Big Query');
    } catch (error) {
      this.logger?.error(`[TRS]: Error when inserting row into Big Query. ${JSON.stringify(error)}`);
    }
  }
}
