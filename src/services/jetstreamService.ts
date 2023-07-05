import {
  AckPolicy,
  RetentionPolicy,
  StorageType,
  StringCodec,
  connect,
  type ConsumerConfig,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
  type StreamConfig,
} from 'nats';
import { type ILoggerService } from '../interfaces';
import { startupConfig } from '../interfaces/iStartupConfig';
import { type onMessageFunction } from '../types/onMessageFunction';
import { type IStartupService } from '../interfaces/iStartupService';

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

  async closeConnection(nc: NatsConnection, done: Promise<unknown | Error>): Promise<void> {
    await nc.close();
    console.log('Connection closed');
    // check if the close was OK
    const err = await done;
    if (err) {
      console.log('Error closing connection:', err);
    }
    await Promise.resolve();
  }

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

  async init(onMessage: onMessageFunction, loggerService?: ILoggerService): Promise<boolean> {
    try {
      // Validate additional Environmental Variables.
      if (!startupConfig.consumerStreamName) {
        throw new Error(`No Consumer Stream Name Provided in environmental Variable`);
      }
      this.initProducer(loggerService);
      // Guard statement to ensure initProducer was successful
      if (!this.NatsConn || !this.jsm || !this.js || !this.logger) return await Promise.resolve(false);
      // this promise indicates the client closed
      const done = this.NatsConn.closed();

      // Add consumer streams
      this.consumerStreamName = startupConfig.consumerStreamName; // "RuleRequest";
      await this.createConsumer(this.functionName, this.jsm, this.consumerStreamName);

      if (this.consumerStreamName) await this.consume(this.js, onMessage, this.consumerStreamName, this.functionName);
      this.logger.log('Consumer subscription closed');

      // close the connection
      await this.closeConnection(this.NatsConn, done);
    } catch (err) {
      this.logger?.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${JSON.stringify(err)}`);
      throw err;
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
  async initProducer(loggerService?: ILoggerService): Promise<boolean> {
    await this.validateEnvironment();
    // Connect to NATS Server
    this.NatsConn = await connect(this.server);
    if (loggerService) {
      this.logger = startupConfig.env === 'dev' || startupConfig.env === 'test' ? console : loggerService;
    } else {
      this.logger = console;
    }

    try {
      this.logger.log(`Connected to ${this.NatsConn.getServer()}`);
      this.functionName = startupConfig.functionName.replace(/\./g, '_');

      // Jetstream setup
      this.jsm = await this.NatsConn.jetstreamManager();
      this.js = this.NatsConn.jetstream();

      // Add producer streams
      this.producerStreamName = startupConfig.producerStreamName; // `RuleResponse${functionName}`;
      await this.createStream(this.jsm, this.producerStreamName);
    } catch (error) {
      this.logger.log(`Error communicating with NATS on: ${JSON.stringify(this.server)}, with error: ${JSON.stringify(error)}`);
      throw error;
    }

    return await Promise.resolve(true);
  }

  async validateEnvironment(): Promise<void> {
    if (!startupConfig.producerStreamName) {
      throw new Error(`No Producer Stream Name Provided in environmental Variable`);
    }

    if (!startupConfig.serverUrl) {
      throw new Error(`No Server URL was Provided in environmental Variable`);
    }

    if (!startupConfig.functionName) {
      throw new Error(`No Function Name was Provided in environmental Variable`);
    }
    await Promise.resolve(undefined);
  }

  async createConsumer(functionName: string, jsm: JetStreamManager, consumerStreamName: string): Promise<void> {
    const consumerStreams = consumerStreamName.split(',');

    for (const stream of consumerStreams) {
      await this.createStream(jsm, stream, startupConfig.streamSubject ? startupConfig.streamSubject : undefined);
      // Require Nats Version 2.10 to be released. Slated for a few months.
      // const streamSubjects = startupConfig.streamSubject ? startupConfig.streamSubject.split(',') : [startupConfig.consumerStreamName];

      const typedAckPolicy = startupConfig.ackPolicy;
      const consumerCfg: Partial<ConsumerConfig> = {
        ack_policy: AckPolicy[typedAckPolicy],
        durable_name: functionName,
        // filter_subjects: streamSubjects, Require Nats Version 2.10 to be released. Slated for a few months.
      };
      await jsm.consumers.add(stream, consumerCfg);
      this.logger?.log('Connected Consumer to Consumer Stream');
    }
    await Promise.resolve(undefined);
  }

  async createStream(jsm: JetStreamManager, streamName: string, subjectName?: string): Promise<void> {
    await jsm.streams.find(streamName).then(
      async (stream) => {
        this.logger?.log(`Stream: ${streamName} already exists.`);

        if (subjectName) {
          this.logger?.log(`Adding subject: ${subjectName} to stream: ${streamName}`);
          const streamInfo = await jsm.streams.info(stream);

          if (streamInfo.config.subjects.includes(subjectName)) {
            this.logger?.log('Subject Already present');
            return;
          }

          if (streamInfo.config.subjects) streamInfo.config.subjects.push(subjectName);
          else streamInfo.config.subjects = [subjectName];
          await jsm.streams.update(streamName, streamInfo.config);
        }
      },
      async (reason) => {
        const typedRetentionPolicy = startupConfig.producerRetentionPolicy as keyof typeof RetentionPolicy;
        const typedStorgage = startupConfig.producerStorage as keyof typeof StorageType;

        const cfg: Partial<StreamConfig> = {
          name: streamName,
          subjects: [subjectName ?? streamName],
          retention: RetentionPolicy[typedRetentionPolicy],
          storage: StorageType[typedStorgage],
        };
        await jsm.streams.add(cfg);
        this.logger?.log(`Created stream: ${streamName}`);
      },
    );
  }

  /**
   * Handle the response once the function executed by onMessage is complete. Publish it to the Producer Stream
   *
   * @export
   * @param {string} response Response string to be send to the producer stream.
   *
   * @return {*}  {Promise<void>}
   */
  async handleResponse(response: unknown, subject?: string[]): Promise<void> {
    const sc = StringCodec();
    const publishes = [];
    const res = JSON.stringify(response);

    if (this.producerStreamName) {
      if (!subject) {
        publishes.push(this.js?.publish(this.producerStreamName, sc.encode(res)));
      } else {
        for (const sub of subject) {
          publishes.push(this.js?.publish(sub, sc.encode(res)));
        }
      }
      await Promise.all(publishes);
    }
    await Promise.resolve();
  }

  async consume(js: JetStreamClient, onMessage: onMessageFunction, consumerStreamName: string, functionName: string): Promise<void> {
    // Get the consumer to listen to messages for
    const consumer = await js.consumers.get(consumerStreamName, functionName);

    // create a simple consumer and iterate over messages matching the subscription
    const sub = await consumer.consume({ max_messages: 1 });

    for await (const message of sub) {
      console.debug(`${Date.now().toLocaleString()} S:[${message?.seq}] Q:[${message.subject}]: ${message.data.length}`);
      const request = message.json<string>();

      await onMessage(request, this.handleResponse);
      message.ack();
    }
  }
}
