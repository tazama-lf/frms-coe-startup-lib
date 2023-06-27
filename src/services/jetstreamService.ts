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
import { startupConfig } from '../interfaces/StartupConfig';
import { type onMessageFunction } from '../types/onMessageFunction';
import { type ILoggerService } from '../interfaces';

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
  if (loggerService) {
    logger = startupConfig.env === 'dev' || startupConfig.env === 'test' ? console : loggerService;
  } else {
    logger = console;
  }

  try {
    // Validate Environmental Variables.
    await validateEnvironment();

    // Connect to NATS Server
    const natsConn = await connect(server);
    logger.log(`Connected to ${natsConn.getServer()}`);

    // this promise indicates the client closed
    const done = natsConn.closed();
    const functionName = startupConfig.functionName.replace(/\./g, '_');

    // Jetstream setup
    const jsm = await natsConn.jetstreamManager();

    // Add consumer streams
    consumerStreamName = startupConfig.consumerStreamName; // "RuleRequest";
    await createConsumer(functionName, jsm, consumerStreamName);

    // Add producer streams
    producerStreamName = startupConfig.producerStreamName; // `RuleResponse${functionName}`;
    await createProducer(jsm);

    logger.log(`created the stream with functionName ${functionName}`);
    js = natsConn.jetstream();

    if (consumerStreamName) await consume(js, onMessage, consumerStreamName, functionName);
    logger.log('Consumer subscription closed');
    // close the connection
    await closeConnection(natsConn, done);
  } catch (err) {
    logger.log(`Error communicating with NATS on: ${JSON.stringify(server)}, with error: ${JSON.stringify(err)}`);
    throw err;
  }
  return true;
}

export async function sendMessage(data: unknown): Promise<void> {
  // Establish Connection to Nats Server
  const natsConn = await connect(server);
  logger.log(`connected to ${natsConn.getServer()}`);

  // Jetstream setup
  const jsm = await natsConn.jetstreamManager();

  const functionName = startupConfig.functionName.replace(/\./g, '_');
  producerStreamName = startupConfig.producerStreamName; // output
  // consumerStreamName = startupConfig.consumerStreamName; // input

  await createProducer(jsm);
  // await createConsumer(functionName, jsm, consumerStreamName);

  logger.log(`created the stream with functionName ${functionName}`);
  const js = natsConn.jetstream();

  const sc = StringCodec();
  if (producerStreamName) await js.publish(producerStreamName, sc.encode(JSON.stringify(data)));

  const done = natsConn.closed();
  await closeConnection(natsConn, done);
}

async function validateEnvironment(): Promise<void> {
  if (!startupConfig.consumerStreamName) {
    throw new Error(`No Consumer Stream Name Provided in environmental Variable`);
  }

  if (!startupConfig.producerStreamName) {
    throw new Error(`No Producer Stream Name Provided in environmental Variable`);
  }

  if (!startupConfig.serverUrl) {
    throw new Error(`No Server URL was Provided in environmental Variable`);
  }
}

async function createConsumer(functionName: string, jsm: JetStreamManager, consumerStreamName: string): Promise<void> {
  const typedAckPolicy = startupConfig.ackPolicy;
  const consumerCfg: Partial<ConsumerConfig> = {
    ack_policy: AckPolicy[typedAckPolicy],
    durable_name: functionName,
  };
  await jsm.consumers.add(consumerStreamName, consumerCfg);
}

async function createProducer(jsm: JetStreamManager): Promise<void> {
  await jsm.streams.find(producerStreamName).then(
    (s) => {
      logger.log('Producer stream already exists');
    },
    async (reason) => {
      const typedRetentionPolicy = startupConfig.producerRetentionPolicy as keyof typeof RetentionPolicy;
      const typedStorgage = startupConfig.producerStorage as keyof typeof StorageType;

      const cfg: Partial<StreamConfig> = {
        name: producerStreamName,
        subjects: [producerStreamName],
        retention: RetentionPolicy[typedRetentionPolicy],
        storage: StorageType[typedStorgage],
      };
      await jsm.streams.add(cfg);
      logger.log('Created the producer stream');
    },
  );
}

export async function handleResponse(response: string): Promise<void> {
  const sc = StringCodec();
  if (producerStreamName) await js.publish(producerStreamName, sc.encode(response));
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
