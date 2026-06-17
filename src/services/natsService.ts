// SPDX-License-Identifier: Apache-2.0

import { connect, type NatsConnection, type Subscription } from 'nats';
import type { ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import type { onMessageFunction } from '../types/onMessageFunction';
import type { IStartupService } from '..';
import { createMessageBuffer, decodeMessageBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
//import { FRMSMessage } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import { getLogger } from '../utils';

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
        subs.push(this.NatsConn.subscribe(consumerStream, { queue: this.functionName }));
      }

      (() => {
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
      this.logger?.log(`${Date.now().toLocaleString()} sid:[${message.sid}] subject:[${message.subject}]: ${message.data.length}`);
      const messageObject = decodeMessageBuffer(Buffer.from(message.data));

      onMessage(messageObject, (msg) => {
        this.handleResponse(msg).catch((err: unknown) => {
          this.logger?.error(`Error handling response on default path: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
        });
      });
      Promise.resolve();
    }
  }

  /**
   * Additively subscribe to new transaction-plane consumer subjects on the already-running connection.
   *
   * Runtime sibling of {@link init}: where `init` stands the consumers up at startup, `addConsumers`
   * extends them at runtime WITHOUT reconnecting or tearing down existing subscriptions
   * (the additive half of make-before-break re-subscribe on network-map reload).
   *
   * Idempotent: subjects already present in `consumerStreamName`, empty strings, and repeats within
   * the input are skipped. Returns `false` (without throwing) when there is no live connection.
   *
   * @param {string[]} subjects Consumer subjects to add. New, non-empty, not-already-subscribed ones
   * are subscribed with the `{ queue: functionName }` group and wired into the existing consume loop.
   * @param {onMessageFunction} onMessage Callback invoked for every message on the added subjects.
   * @return {*} {Promise<boolean>} `true` once the additive subscribe completed (including no-ops), `false` if not connected.
   */
  async addConsumers(subjects: string[], onMessage: onMessageFunction): Promise<boolean> {
    if (!this.NatsConn) {
      this.logger?.warn('addConsumers called with no live NATS connection; nothing subscribed');
      return await Promise.resolve(false);
    }

    const existing = this.consumerStreamName ?? [];
    const toAdd = [...new Set(subjects.filter((subject) => subject && !existing.includes(subject)))];

    for (const subject of toAdd) {
      const subscription = this.NatsConn.subscribe(subject, { queue: this.functionName });
      void this.subscribe(subscription, onMessage);
    }

    this.consumerStreamName = [...existing, ...toAdd];
    return true;
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
    this.validateEnvironment();
    this.logger = getLogger(startupConfig, loggerService);

    try {
      // Connect to NATS Server
      this.logger.log(`Attempting connection to NATS, with config:\n${JSON.stringify(startupConfig)}`);
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
      this.logger.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${errorMessage}`);
      throw error;
    }

    this.NatsConn.closed().then(() => {
      this.logger!.log('Connection Lost to NATS Server.');
    });

    return true;
  }

  validateEnvironment(): void {
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
  // eslint-disable-next-line @typescript-eslint/require-await -- Diffrent implementations of the handleresponse interface require a async signature.
  async handleResponse(response: object, subject?: string[]): Promise<void> {
    if (!this.NatsConn) return;

    const messageBuffer = createMessageBuffer(response as Record<string, unknown>);

    if (subject && subject.length > 0) {
      for (const sub of subject) {
        this.NatsConn.publish(sub, messageBuffer);
      }
      return;
    }

    if (!this.producerStreamName) {
      throw new Error('No subject supplied and no PRODUCER_STREAM configured; cannot determine a publish destination.');
    }

    this.NatsConn.publish(this.producerStreamName, messageBuffer);
  }

  /**
   * Initialize the service-channel producer connection.
   *
   * Mirrors {@link initProducer}'s single `connect`, but degrades rather than throws: a failed
   * service-channel connect is logged and non-fatal, so the host service keeps running its
   * transaction-plane work. nats.js default auto-reconnect handles later drops.
   *
   * @param {ILoggerService} [loggerService] Optional injected logger.
   * @return {Promise<boolean>} `true` when connected, `false` when the initial connect failed.
   */
  async initServiceChannelProducer(loggerService?: ILoggerService): Promise<boolean> {
    this.logger = getLogger(startupConfig, loggerService);
    try {
      this.logger.log(`Attempting service-channel connection to NATS on: ${JSON.stringify(this.server)}`);
      this.NatsConn = await connect(this.server);
      this.logger.log(`Service channel connected to ${this.NatsConn.getServer()}`);
      this.functionName = startupConfig.functionName.replace(/\./g, '_');

      this.NatsConn.closed().then(() => {
        this.logger?.log('Service-channel connection lost to NATS Server.');
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
      this.logger.log(`Service-channel connect failed (non-fatal): ${errorMessage}`);
      return false;
    }

    return true;
  }

  /**
   * Publish an opaque body to a service-channel subject.
   *
   * The bytes are published verbatim - no protobuf encode (a behavioural fork from
   * {@link handleResponse}); serialization belongs to the caller.
   *
   * @param {Uint8Array} body Opaque payload published as-is.
   * @param {string} [subject] Target subject; defaults to `SERVICE_CHANNEL_PRODUCER`.
   * @return {Promise<void>}
   * @throws {Error} When neither `subject` nor `SERVICE_CHANNEL_PRODUCER` is set.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async signature mirrors the publish-primitive contract
  async publishServiceChannel(body: Uint8Array, subject?: string): Promise<void> {
    const target = subject ?? startupConfig.serviceChannelProducer;
    if (!target) {
      throw new Error('No subject provided and SERVICE_CHANNEL_PRODUCER is not set in the environment.');
    }

    this.NatsConn?.publish(target, body);
    this.logger?.log(`Service-channel published ${body.length} bytes to subject:[${target}]`);
  }

  /**
   * Subscribe to a service-channel subject and invoke `onMessage` with each message's raw bytes.
   *
   * Subscribes with NO queue group - a plain core-NATS subscription, so the subject is broadcast
   * fan-out (every instance receives every message), unlike the transaction-plane {@link subscribe}'s
   * `{ queue }` load-balancing. `message.data` is handed to `onMessage` un-decoded (no protobuf).
   *
   * @param {(data: Uint8Array) => void | Promise<void>} onMessage Per-message handler.
   * @param {string} [subject] Subject to subscribe to; defaults to `SERVICE_CHANNEL_CONSUMER`.
   * @param {ILoggerService} [loggerService] Optional injected logger.
   * @return {Promise<boolean>} `true` once subscribed, `false` when there is no connection.
   * @throws {Error} When neither `subject` nor `SERVICE_CHANNEL_CONSUMER` is set.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async signature mirrors the consumer-primitive contract
  async initServiceChannel(
    onMessage: (data: Uint8Array) => void | Promise<void>,
    subject?: string,
    loggerService?: ILoggerService,
  ): Promise<boolean> {
    const target = subject ?? startupConfig.serviceChannelConsumer;
    if (!target) {
      throw new Error('No subject provided and SERVICE_CHANNEL_CONSUMER is not set in the environment.');
    }

    if (loggerService) this.logger = getLogger(startupConfig, loggerService);
    if (!this.NatsConn) return false;

    const subscription = this.NatsConn.subscribe(target);
    void this.consumeServiceChannel(subscription, onMessage);
    return true;
  }

  async consumeServiceChannel(subscription: Subscription, onMessage: (data: Uint8Array) => void | Promise<void>): Promise<void> {
    for await (const message of subscription) {
      this.logger?.log(`Service-channel received sid:[${message.sid}] subject:[${message.subject}]: ${message.data.length} bytes`);
      await onMessage(message.data);
    }
  }
}
