// SPDX-License-Identifier: Apache-2.0

import { connect, type NatsConnection, type Subscription } from 'nats';
import { type ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import { type onMessageFunction } from '../types/onMessageFunction';
import { type IStartupService } from '..';
import FRMSMessage from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';

export class NatsService implements IStartupService {
  server = {
    servers: startupConfig.serverUrl,
  };

  producerStreamName = '';
  consumerStreamName: string[] | undefined;
  functionName = '';
  NatsConn?: NatsConnection;
  logger?: ILoggerService | Console;

  /**
   * Initialize Nats consumer, supplying a callback function to call every time a new message comes in.
   *
   * @export
   * @param {Function} onMessage Method to be called every time there's a new message. Will be called with two parameters:
   * A json object with the message as parameter;
   * A handleResponse method that should be called when the function is done processing, giving the response object as parameter.
   *
   * The Following environmental variables is required for this function to work:
   * NODE_ENV=debug
   * SERVER_URL=0.0.0.0:4222 <- Nats Server URL
   * FUNCTION_NAME=function_name <- Function Name is used to determine streams.
   *
   * @return {*}  {Promise<boolean>}
   */

  async init(
    onMessage: onMessageFunction,
    loggerService?: ILoggerService,
    parConsumerStreamNames?: string[],
    parProducerStreamName?: string,
  ): Promise<boolean> {
    try {
      // Validate additional Environmental Variables.
      if (!startupConfig.consumerStreamName && !parConsumerStreamNames?.length) {
        throw new Error('No Consumer Stream Name Provided in environmental Variable or on startup as an arguement');
      }
      if (parProducerStreamName) startupConfig.producerStreamName = parProducerStreamName;
      if (parConsumerStreamNames) startupConfig.consumerStreamName = String(parConsumerStreamNames);

      await this.initProducer(loggerService, parProducerStreamName);
      if (!this.NatsConn || !this.logger) return await Promise.resolve(false);

      // Add consumer streams
      this.consumerStreamName = startupConfig.consumerStreamName.split(',');
      const subs: Subscription[] = [];
      for (const consumerStream of this.consumerStreamName) {
        subs.push(this.NatsConn.subscribe(`${consumerStream}`, { queue: `${this.functionName}` }));
      }

      (async () => {
        for (const sub of subs) {
          this.subscribe(sub, onMessage);
        }
      })();
    } catch (err) {
      let error: Error;
      let errorMessage = '';

      if (err instanceof Error) {
        error = err;
        errorMessage = error.message;
      } else {
        errorMessage = JSON.stringify(err);
        error = new Error(errorMessage);
      }
      this.logger?.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${errorMessage}`);
      throw error;
    }
    return true;
  }

  async subscribe(subscription: Subscription, onMessage: onMessageFunction): Promise<void> {
    for await (const message of subscription) {
      console.debug(`${Date.now().toLocaleString()} sid:[${message?.sid}] subject:[${message.subject}]: ${message.data.length}`);
      const messageDecoded = FRMSMessage.decode(message.data);
      const messageObject = FRMSMessage.toObject(messageDecoded);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      await onMessage(messageObject, this.handleResponse);
    }
  }

  /**
   * Initialize Nats Producer
   *
   * @export
   * @param {Function} loggerService
   *
   * Method to init Producer Stream. This function will not react to incomming NATS messages.
   * The Following environmental variables is required for this function to work:
   * NODE_ENV=debug
   * SERVER_URL=0.0.0.0:4222 - Nats Server URL
   * FUNCTION_NAME=function_name - Function Name is used to determine streams.
   * PRODUCER_STREAM - Stream name for the producer Stream
   *
   * @return {*}  {Promise<boolean>}
   */

  async initProducer(loggerService?: ILoggerService, parProducerStreamName?: string): Promise<boolean> {
    await this.validateEnvironment(parProducerStreamName);
    if (loggerService) {
      this.logger = startupConfig.env === 'dev' || startupConfig.env === 'test' ? console : loggerService;
    } else {
      this.logger = console;
    }

    try {
      // Connect to NATS Server
      this.logger.log(`Attempting connection to NATS, with config:\n${JSON.stringify(startupConfig, null, 4)}`);
      this.NatsConn = await connect(this.server);
      this.logger.log(`Connected to ${this.NatsConn.getServer()}`);
      this.functionName = startupConfig.functionName.replace(/\./g, '_');

      // Init producer streams
      this.producerStreamName = startupConfig.producerStreamName;
      if (parProducerStreamName) this.producerStreamName = parProducerStreamName;
    } catch (err) {
      let error: Error;
      let errorMessage = '';

      if (err instanceof Error) {
        error = err;
        errorMessage = error.message;
      } else {
        errorMessage = JSON.stringify(err);
        error = new Error(errorMessage);
      }
      this.logger?.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${errorMessage}`);
      throw error;
    }

    this.NatsConn.closed().then(async () => {
      this.logger!.log('Connection Lost to NATS Server.');
    });

    return true;
  }

  async validateEnvironment(parProducerStreamName?: string): Promise<void> {
    if (!startupConfig.producerStreamName && !parProducerStreamName) {
      throw new Error('No Producer Stream Name Provided in environmental Variable or on startup as an arguement');
    }

    if (!startupConfig.serverUrl) {
      throw new Error('No Server URL was Provided in environmental Variable');
    }

    if (!startupConfig.functionName) {
      throw new Error('No Function Name was Provided in environmental Variable');
    }
  }

  /**
   * Handle the response once the function executed by onMessage is complete. Publish it to the Producer Stream
   *
   * @export
   * @param {string} response Response string to be send to the producer stream.
   *
   * @return {*}  {Promise<void>}
   */
  async handleResponse(response: object, subject?: string[]): Promise<void> {
    const message = FRMSMessage.create(response);
    const messageBuffer = FRMSMessage.encode(message).finish();

    if (this.producerStreamName && this.NatsConn) {
      if (!subject) {
        this.NatsConn.publish(this.producerStreamName, messageBuffer);
      } else {
        for (const sub of subject) {
          this.NatsConn.publish(sub, messageBuffer);
        }
      }
    }
  }
}
