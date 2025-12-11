// SPDX-License-Identifier: Apache-2.0

import FRMSMessage from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import {
  AckPolicy,
  RetentionPolicy,
  StorageType,
  connect,
  headers as natsHeaders,
  type ConsumerConfig,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
  type StreamConfig,
} from 'nats';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import type { IStartupService, tHeader } from '../interfaces/iStartupService';
import type { onMessageFunction } from '../types/onMessageFunction';
import { getLogger } from '../utils';

export class JetstreamService implements IStartupService {
  server = {
    servers: startupConfig.serverUrl,
  };

  producerStreamName = '';
  consumerStreamName = '';
  functionName = '';
  NatsConn?: NatsConnection;
  jsm?: JetStreamManager;
  js?: JetStreamClient;
  logger?: ILoggerService | Console;
  onMessage?: onMessageFunction;

  /**
   * Initialize JetStream consumer, supplying a callback function to call every time a new message comes in.
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
    isCommandChannel = false,
  ): Promise<boolean> {
    try {
      // Validate additional Environmental Variables.
      if (!startupConfig.consumerStreamName && !parConsumerStreamNames?.length) {
        throw new Error('No Consumer Stream Name Provided in environmental Variable');
      }
      this.producerStreamName = parProducerStreamName ?? startupConfig.producerStreamName;
      this.consumerStreamName = parConsumerStreamNames ? parConsumerStreamNames.join(',') : startupConfig.consumerStreamName;

      this.onMessage = onMessage;
      await this.initProducer(loggerService, this.producerStreamName);
      // Guard statement to ensure initProducer was successful
      if (!this.NatsConn || !this.jsm || !this.js || !this.logger) return await Promise.resolve(false);

      // Add consumer streams
      await this.createConsumer(this.functionName, this.jsm, this.consumerStreamName, isCommandChannel);

      if (this.consumerStreamName) await this.consume(this.js, onMessage, this.consumerStreamName, this.functionName);
    } catch (err) {
      let error: Error;
      let errorMessage = '';
      if (err instanceof Error) {
        error = err;
        errorMessage = error.message;
      } else {
        const strErr = JSON.stringify(err);
        errorMessage = strErr;
        error = new Error(errorMessage);
      }
      this.logger?.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${errorMessage}`);
      throw error;
    }
    return await Promise.resolve(true);
  }

  /**
   * Initialize JetStream Producer Stream
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
  async initProducer(loggerService?: ILoggerService, parProducerStreamName?: string, isCommandChannel?: boolean): Promise<boolean> {
    await this.validateEnvironment();
    this.logger = getLogger(startupConfig, loggerService);

    try {
      // Connect to NATS Server
      this.logger.log(`Attempting connection to NATS, with config:\n${JSON.stringify(this.server)}`);
      this.logger.log(`Producer Stream: ${this.producerStreamName}`);
      this.logger.log(`Consumer Stream: ${this.consumerStreamName}`);
      this.NatsConn = await connect(this.server);
      this.logger.log(`Connected to ${this.NatsConn.getServer()}`);
      this.functionName = startupConfig.functionName.replace(/\./g, '_');

      // Jetstream setup
      this.jsm = await this.NatsConn.jetstreamManager();
      this.js = this.NatsConn.jetstream();

      // Add producer streams
      this.producerStreamName = parProducerStreamName ?? startupConfig.producerStreamName;
      await this.createStream(this.jsm, this.producerStreamName);
    } catch (err) {
      let error: Error;
      let errorMessage = '';
      if (err instanceof Error) {
        error = err;
        errorMessage = error.message;
      } else {
        const strErr = JSON.stringify(err);
        errorMessage = strErr;
        error = new Error(errorMessage);
      }
      this.logger.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${errorMessage}`);
      throw error;
    }

    this.NatsConn.closed().then(async () => {
      this.logger!.log('Connection Lost to NATS Server, Reconnecting...');
      let connected = false;

      while (!connected) {
        this.logger!.log('Attempting to recconect to NATS...');
        connected = await this.connectNats(isCommandChannel ?? false);
        if (!connected) {
          this.logger!.warn('Unable to connect, retrying....');
          await setTimeout(5000);
        } else {
          this.logger!.log('Reconnected to nats');
          break;
        }
      }
    });
    return await Promise.resolve(true);
  }

  async validateEnvironment(parProducerStreamName?: string): Promise<void> {
    if (!startupConfig.producerStreamName && !parProducerStreamName && !startupConfig.commandChannelProducerStreamName) {
      throw new Error('No Producer Stream Name Provided in environmental Variable');
    }

    if (!startupConfig.serverUrl) {
      throw new Error('No Server URL was Provided in environmental Variable');
    }

    if (!startupConfig.functionName) {
      throw new Error('No Function Name was Provided in environmental Variable');
    }
    await Promise.resolve(undefined);
  }

  async connectNats(isCommandChannel: boolean): Promise<boolean> {
    try {
      this.NatsConn = await connect(this.server);

      this.jsm = await this.NatsConn.jetstreamManager();
      this.js = this.NatsConn.jetstream();

      if (this.consumerStreamName && this.onMessage) {
        await this.createConsumer(this.functionName, this.jsm, this.consumerStreamName, isCommandChannel);
        await this.consume(this.js, this.onMessage, this.consumerStreamName, this.functionName);
      }
    } catch (error) {
      this.logger?.log(`Failed to connect to NATS.\n${JSON.stringify(error)}`);
      return false;
    }
    return true;
  }

  async createConsumer(functionName: string, jsm: JetStreamManager, consumerStreamName: string, isCommandChannel: boolean): Promise<void> {
    const consumerStreams = consumerStreamName.split(',');

    for (const stream of consumerStreams) {
      let createStreamSubject = startupConfig.streamSubject ? startupConfig.streamSubject : undefined;
      let streamSubjects = startupConfig.streamSubject ? startupConfig.streamSubject.split(',') : [startupConfig.consumerStreamName];

      if (isCommandChannel) {
        createStreamSubject = startupConfig.commandChannelStreamSubject ? startupConfig.commandChannelStreamSubject : undefined;
        streamSubjects = startupConfig.commandChannelStreamSubject
          ? startupConfig.commandChannelStreamSubject.split(',')
          : [startupConfig.commandChannelConsumerStreamName];
      }

      await this.createStream(jsm, stream, createStreamSubject);

      this.functionName = `${functionName}-${randomUUID()}`;
      const typedAckPolicy = startupConfig.ackPolicy;
      const consumerCfg: Partial<ConsumerConfig> = {
        ack_policy: AckPolicy[typedAckPolicy],
        durable_name: this.functionName,
        filter_subjects: streamSubjects,
      };
      await jsm.consumers.add(stream, consumerCfg);
      this.logger?.log('Connected Consumer to Consumer Stream');
    }
    await Promise.resolve(undefined);
  }

  async createStream(jsm: JetStreamManager, streamName: string, subjectName?: string): Promise<void> {
    // Parse subjects from the optional subjectName argument
    const newSubjects = subjectName
      ? subjectName
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];

    try {
      // Check if the stream already exists by NAME
      const streamInfo = await jsm.streams.info(streamName);
      this.logger?.log(`Stream: ${streamName} already exists.`);

      if (!newSubjects.length) {
        // nothing to add
        return;
      }

      const currentSubjects = streamInfo.config.subjects ?? [];
      const merged = [...new Set([...currentSubjects, ...newSubjects])];

      if (merged.length === currentSubjects.length) {
        this.logger?.log(`All subject(s) [${newSubjects.join(', ')}] already present on stream: ${streamName}`);
        return;
      }

      streamInfo.config.subjects = merged;

      // Depending on your nats.js version, this is either:
      // await jsm.streams.update(streamInfo.config);
      // or:
      await jsm.streams.update(streamName, streamInfo.config);

      this.logger?.log(`Updated stream: ${streamName} with subjects: ${newSubjects.join(', ')}`);
    } catch (err) {
      // If the stream isn't found, nats.js throws a NatsError with code 404/STREAM_NOT_FOUND
      const error = err as { code: string; message: string };
      const code = error?.code;

      if (code !== '404') {
        this.logger?.error(`Error checking stream: ${streamName}`);
        this.logger?.error(error.message);
        throw new Error(error.message);
      }

      // Stream doesn't exist -> create it
      const typedRetentionPolicy = startupConfig.producerRetentionPolicy as keyof typeof RetentionPolicy;
      const typedStorage = startupConfig.producerStorage as keyof typeof StorageType;

      const cfg: Partial<StreamConfig> = {
        name: streamName,
        subjects: newSubjects.length ? newSubjects : [streamName],
        retention: RetentionPolicy[typedRetentionPolicy],
        storage: StorageType[typedStorage],
      };

      await jsm.streams.add(cfg);
      this.logger?.log(`Created stream: ${streamName} with subjects: ${cfg.subjects?.join(', ')}`);
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
  async handleResponse(response: object, subject?: string[], headers?: tHeader[]): Promise<void> {
    const publishes = [];

    const h = natsHeaders();
    if (headers) {
      for (const header of headers) {
        h.set(header.key, header.value);
      }
    }

    const message = FRMSMessage.create(response);
    const messageBuffer = FRMSMessage.encode(message).finish();

    if (this.js && this.producerStreamName) {
      if (!subject) {
        publishes.push(this.js.publish(this.producerStreamName, messageBuffer, { headers: h }));
      } else {
        for (const sub of subject) {
          publishes.push(this.js.publish(sub, messageBuffer, { headers: h }));
        }
      }
      await Promise.all(publishes);
    }
    await Promise.resolve();
  }

  async consume(js: JetStreamClient, onMessage: onMessageFunction, consumerStreamName: string, functionName: string): Promise<void> {
    // Get the consumer to listen to messages for
    const consumer = await js.consumers.get(consumerStreamName, this.functionName);

    // create a simple consumer and iterate over messages matching the subscription
    const sub = await consumer.consume({ max_messages: 1 });

    for await (const message of sub) {
      this.logger?.log(`${Date.now().toLocaleString()} S:[${message.seq}] Q:[${message.subject}]: ${message.data.length}`);
      const messageDecoded = FRMSMessage.decode(message.data);

      let messageObject;
      if (message.headers?.keys().length) {
        // if there are headers include them, evaluation channel support no headers
        messageObject = { message: FRMSMessage.toObject(messageDecoded), headers: message.headers };
      } else {
        messageObject = FRMSMessage.toObject(messageDecoded);
      }

      try {
        onMessage(messageObject, (msg) => {
          void this.handleResponse(msg);
        });
      } catch (error) {
        this.logger?.error(`Error while handling message: \r\n${error as string}`);
      }
      message.ack();
    }
  }
}
