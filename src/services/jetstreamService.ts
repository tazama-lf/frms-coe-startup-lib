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

const server = {
  servers: startupConfig.serverUrl,
};

async function closeConnection(nc: NatsConnection, done: Promise<unknown | Error>): Promise<void> {
  await nc.close();
  // check if the close was OK
  const err = await done;
  if (err) {
    console.log('error closing:', err);
  }
}

let producerStreamName: string;
let consumerStreamName: string;
let functionName: string;
let NatsConn: NatsConnection;
let jsm: JetStreamManager;
let js: JetStreamClient;
let logger: ILoggerService | Console;

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

export async function init(onMessage: onMessageFunction, loggerService?: ILoggerService): Promise<boolean> {
  try {
    // Validate additional Environmental Variables.
    if (!startupConfig.consumerStreamName) {
      throw new Error(`No Consumer Stream Name Provided in environmental Variable`);
    }

    await initProducer(loggerService);

    // this promise indicates the client closed
    const done = NatsConn.closed();

    // Add consumer streams
    consumerStreamName = startupConfig.consumerStreamName; // "RuleRequest";
    await createConsumer(functionName, jsm, consumerStreamName);

    if (consumerStreamName) await consume(js, onMessage, consumerStreamName, functionName);
    logger.log('Consumer subscription closed');

    // close the connection
    await closeConnection(NatsConn, done);
  } catch (err) {
    logger.log(`Error communicating with NATS on: ${JSON.stringify(server)}, with error: ${JSON.stringify(err)}`);
    throw err;
  }
  return true;
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

export async function initProducer(loggerService?: ILoggerService): Promise<boolean> {
  await validateEnvironment();
  if (loggerService) {
    logger = startupConfig.env === 'dev' || startupConfig.env === 'test' ? console : loggerService;
  } else {
    logger = console;
  }

  try {
    // Connect to NATS Server
    NatsConn = await connect(server);
    logger.log(`Connected to ${NatsConn.getServer()}`);
    functionName = startupConfig.functionName.replace(/\./g, '_');

    // Jetstream setup
    jsm = await NatsConn.jetstreamManager();
    js = NatsConn.jetstream();

    // Add producer streams
    producerStreamName = startupConfig.producerStreamName; // `RuleResponse${functionName}`;
    await createStream(jsm, producerStreamName);
  } catch (error) {
    logger.log(`Error communicating with NATS on: ${JSON.stringify(server)}, with error: ${JSON.stringify(error)}`);
    throw error;
  }
  return true;
}

async function validateEnvironment(): Promise<void> {
  if (!startupConfig.producerStreamName) {
    throw new Error(`No Producer Stream Name Provided in environmental Variable`);
  }

  if (!startupConfig.serverUrl) {
    throw new Error(`No Server URL was Provided in environmental Variable`);
  }

  if (!startupConfig.functionName) {
    throw new Error(`No Function Name was Provided in environmental Variable`);
  }
}

async function createConsumer(functionName: string, jsm: JetStreamManager, consumerStreamName: string): Promise<void> {
  const consumerStreams = consumerStreamName.split(',');

  for (const stream of consumerStreams) {
    await createStream(jsm, stream, startupConfig.streamSubject ? startupConfig.streamSubject : undefined);
    // Require Nats Version 2.10 to be released. Slated for a few months.
    // const streamSubjects = startupConfig.streamSubject ? startupConfig.streamSubject.split(',') : [startupConfig.consumerStreamName];

    const typedAckPolicy = startupConfig.ackPolicy;
    const consumerCfg: Partial<ConsumerConfig> = {
      ack_policy: AckPolicy[typedAckPolicy],
      durable_name: functionName,
      // filter_subjects: streamSubjects, Require Nats Version 2.10 to be released. Slated for a few months.
    };
    await jsm.consumers.add(stream, consumerCfg);
    logger.log('Connected Consumer to Consumer Stream');
  }
}

async function createStream(jsm: JetStreamManager, streamName: string, subjectName?: string): Promise<void> {
  await jsm.streams.find(streamName).then(
    async (stream) => {
      logger.log(`Stream: ${streamName} already exists.`);

      if (subjectName) {
        logger.log(`Adding subject: ${subjectName} to stream: ${streamName}`);
        const streamInfo = await jsm.streams.info(stream);

        if (streamInfo.config.subjects.includes(subjectName)) {
          logger.log('Subject Already present');
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
      logger.log(`Created stream: ${streamName}`);
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
export async function handleResponse(response: unknown, subject?: string[]): Promise<void> {
  const sc = StringCodec();
  const publishes = [];
  const res = JSON.stringify(response);

  if (producerStreamName)
    if (!subject) {
      publishes.push(js.publish(producerStreamName, sc.encode(res)));
    } else {
      for (const sub of subject) {
        publishes.push(js.publish(sub, sc.encode(res)));
      }

      await Promise.all(publishes);
    }
}

async function consume(js: JetStreamClient, onMessage: onMessageFunction, consumerStreamName: string, functionName: string): Promise<void> {
  // Get the consumer to listen to messages for
  const consumer = await js.consumers.get(consumerStreamName, functionName);

  // create a simple consumer and iterate over messages matching the subscription
  const sub = await consumer.consume({ max_messages: 1 });

  for await (const message of sub) {
    console.debug(`${Date.now().toLocaleString()} S:[${message?.seq}] Q:[${message.subject}]: ${message.data.length}`);
    const request = message.json<string>();

    await onMessage(request, handleResponse);
    message.ack();
  }
}
