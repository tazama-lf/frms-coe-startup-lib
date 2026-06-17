<!-- SPDX-License-Identifier: Apache-2.0 -->

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [Modules and Classes](#modules-and-classes)
- [Sequence Diagram](#sequence-diagram)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

## Overview

`frms-coe-startup-lib` is a library designed to facilitate how messages are transmitted across microservices in the Tazama ecosystem. The library is a wrapper around [NATS](https://nats.io), allowing for flexible and scalable service deployment.

Key features:
- **Service Initialization**: Abstractions for initializing NATS.
- **Message Handling**: Standardized interfaces for processing incoming messages.
- **Configuration Management**: Tools for loading and managing service-specific configurations.
- **Logging**: Integration with custom logging services for consistent log management across services.

## Installation

The npm package is hosted on GitHub. Make sure you're authenticated with GitHub and have the necessary permissions to access the package (`read:packages`). Create a [`.npmrc`](https://docs.npmjs.com/cli/v9/configuring-npm/npmrc?v=true) file if you currently do not have. Add the following content:
```.rc
@tazama-lf:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=some-secret
```
Replace "some-secret" with your GitHub Token.

To install the `frms-coe-startup-lib` package, you can use npm.

1. **Install via npm:**

   ```sh
   npm install @tazama-lf/frms-coe-startup-lib
   ```


2. **Importing in your project:**

Once installed, you can import the library in your project:

  ```typescript
  import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
  ```

3. **Dependencies:**

    Ensure that you have all required dependencies installed, including any specific versions of third-party packages mentioned in the package's peer dependencies.

4. **Environment Configuration:**

    Set up your environment configuration using a `.env` file or environment variables. Refer to the library's [template](.env.template.nats) for details on necessary environment variables.

## Usage

The `frms-coe-startup-lib` library provides an abstraction for initializing and managing NATS. This includes encoding the payload before sending it as well as decoding the payload after it has been received. It includes the `StartupFactory` and `IStartupService` interface for creating and managing services.

### **Initializing a Service**

The `StartupFactory` class initializes NATS. It implements the `IStartupService` interface. The `init` method of the `IStartupService` interface sets up the service to listen for incoming messages. The `onMessageFunction` callback is called with each received message.

**Example:**
```typescript
import { IStartupService } from '@tazama-lf/frms-coe-startup-lib';

async function handleTransaction(req: unknown) {
    console.log('received transaction', req)
}

const server: IStartupService = new StartupFactory();
server.init(handleTransaction);
```

This library uses protobuf to encode and decode messages. The format is defined in the [`frms-coe-lib`](https://github.com/tazama-lf/frms-coe-lib/blob/9151cb58dfa7feeff4bc932cc4ea7d3f43c85a49/src/helpers/proto/Full.proto#L6) and for your message to be transmitted without any data loss, you should ensure it conforms to the protobuf definition.

The `init` function has **optional** parameters
```js
  async init(
    onMessage: onMessageFunction,
    loggerService?: ILoggerService,
    parConsumerStreamNames?: string[],
    parProducerStreamName?: string,
      ): Promise<boolean> {}
```

#### `loggerService`
If provided in the call to `init()`, will use this for internal logging.

#### `parConsumerStreamNames`
If provided in the call to `init()`, this will be a list of consumers that this connection will send messages to. If not provided, an environment variable: `CONSUMER_STREAM`, is read.

To specify multiple consumers, specify comma separated values of your consumers:
```sh
CONSUMER_STREAM=ConsumerA,ConsumerB,ConsumerC
```
Will configure `ConsumerA`, `ConsumerB` and `ConsumerC` as consumers.

#### `parProducerStreamName`
Optional. Sets a **default** publish destination used by `handleResponse` only when no explicit subject is supplied. If omitted here, the `PRODUCER_STREAM` environment variable is read instead. Either source is optional: a content-based router that always passes explicit subjects to `handleResponse` does not need a producer stream at all. When neither a producer stream nor an explicit subject is available, `handleResponse` throws rather than silently dropping the message.

### **Service Channel Transport**

In addition to the transaction plane (`init` / `initProducer` / `handleResponse`), the library exposes a separate **service-channel** transport for out-of-band, broadcast-style messaging (for example, configuration hot-reload notifications). It runs on the same NATS server (reusing `SERVER_URL`) but is deliberately distinct from the transaction plane:

- **Opaque bytes**: the service channel carries a raw `Uint8Array` / `Buffer`. Unlike the transaction plane, it does **not** protobuf-encode or decode - the producer publishes your bytes verbatim and the consumer hands `message.data` to your handler un-decoded. Serialization (and any envelope contract) belongs entirely to the caller.
- **Broadcast fan-out**: `initServiceChannel` subscribes with **no queue group**, so every running instance on a subject receives every message (unlike the transaction plane's load-balanced `{ queue: FUNCTION_NAME }` pattern). This lets each instance reload its own in-memory state.
- **Degrade-not-throw**: a failed service-channel connect is logged and non-fatal - the host service keeps running its transaction-plane work. nats.js default auto-reconnect handles later drops.
- **Split producer / consumer roles**: a service sets `SERVICE_CHANNEL_PRODUCER` (the subject it publishes to) and/or `SERVICE_CHANNEL_CONSUMER` (the subject it subscribes to). Because a service's producer and consumer subjects always differ, a service never delivers its own messages back to itself.

The three primitives are reachable through `StartupFactory`:

```typescript
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';

const service = new StartupFactory();

// Producer side - connect once (degrade-not-throw)
await service.initServiceChannelProducer();
// Publish opaque bytes (subject defaults to SERVICE_CHANNEL_PRODUCER when omitted)
await service.publishServiceChannel(new Uint8Array([1, 2, 3]));

// Consumer side - subscribe with no queue group (subject defaults to SERVICE_CHANNEL_CONSUMER)
await service.initServiceChannel((data: Uint8Array) => {
  // data is the raw payload, un-decoded
  console.log('service-channel message', data);
});
```

Each method accepts an explicit `subject` argument; when omitted it falls back to the configured env var, and throws if neither is set. The optional `SERVICE_CHANNEL_SOURCE_URI_PREFIX` (default `''`) is the deployment-wide `source`-URI prefix used by callers to compose a CloudEvents `source` from their `/`-free `FUNCTION_NAME`.

> **Note:** `FUNCTION_NAME` is now enforced `/`-free at startup (it may still contain dots, e.g. `typology-001@1.0.0`). A `FUNCTION_NAME` containing `/` fails fast at load time.

## Modules and Classes

1. **Startup Factory**

  - **Class**: StartupFactory
    - **Description**: Manages the initialization and handling of the message broker
    - **Methods**:
      - `init(onMessage: onMessageFunction, loggerService?: ILoggerService, parConsumerStreamNames?: string[], parProducerStreamName?: string): Promise<boolean>`: Initializes the startup service.
      - `initProducer(loggerService?: ILoggerService, parProducerStreamName?: string): Promise<boolean>`: Initializes the producer stream.
      - `handleResponse(response: object, subject?: string[]): Promise<void>`: Handles responses from the startup service.
      - `initServiceChannelProducer(loggerService?: ILoggerService): Promise<boolean>`: Connects the service-channel producer (degrade-not-throw).
      - `publishServiceChannel(body: Uint8Array, subject?: string): Promise<void>`: Publishes opaque bytes to a service-channel subject.
      - `initServiceChannel(onMessage: (data: Uint8Array) => void | Promise<void>, subject?: string, loggerService?: ILoggerService): Promise<boolean>`: Subscribes (no queue group) to a service-channel subject.

2. **NATS Service**

  - **Class**: NatsService
    - **Description**: Manages the initialization and handling of NATS services, including subscribing and publishing messages.
    - **Methods**:
      - `init(onMessage: onMessageFunction, loggerService?: ILoggerService, parConsumerStreamNames?: string[], parProducerStreamName?: string): Promise<boolean>`: Initializes the NATS service.
      - `initProducer(loggerService?: ILoggerService, parProducerStreamName?: string): Promise<boolean>`: Initializes the producer stream for NATS.
      - `handleResponse(response: object, subject?: string[]): Promise<void>`: Publishes a response. When one or more explicit `subject`s are supplied, it publishes to each of them (run-time, per-message routing); otherwise it falls back to the configured `PRODUCER_STREAM`. With neither an explicit subject nor a configured producer stream, it throws. A no-op when there is no active connection.
      - `subscribe(subscription: Subscription, onMessage: onMessageFunction): Promise<void>`: Subscribes to a NATS subject and processes incoming messages.
      - `initServiceChannelProducer(loggerService?: ILoggerService): Promise<boolean>`: Connects the service-channel producer; a failed connect is logged and non-fatal.
      - `publishServiceChannel(body: Uint8Array, subject?: string): Promise<void>`: Publishes the caller's bytes verbatim (no protobuf) to a service-channel subject.
      - `initServiceChannel(onMessage: (data: Uint8Array) => void | Promise<void>, subject?: string, loggerService?: ILoggerService): Promise<boolean>`: Subscribes with no queue group (broadcast fan-out) and hands raw `message.data` to the handler.

3. **Interfaces**

  - **Interface**: IStartupConfig
    - **Properties**:
      - `startupType: 'nats'`: The type of service to start.
      - `ackPolicy: 'None' | 'All' | 'Explicit' | 'NotSet'`: Acknowledgment policy.
      - `producerStorage: string`: Storage type for the producer.
      - `producerStreamName: string`: Name of the producer stream.
      - `producerRetentionPolicy: string`: Retention policy for the producer.
      - `consumerStreamName: string`: Name of the consumer stream.
      - `serverUrl: string`: URL of the server.
      - `env: string`: Environment.
      - `functionName: string`: Queue name for NATS messages
      - `streamSubject: string`: Stream subject.
      - `serviceChannelProducer: string`: Service-channel subject this service publishes to (`SERVICE_CHANNEL_PRODUCER`).
      - `serviceChannelConsumer: string`: Service-channel subject this service subscribes to (`SERVICE_CHANNEL_CONSUMER`).
      - `serviceChannelSourceUriPrefix: string`: Deployment-wide `source`-URI prefix (`SERVICE_CHANNEL_SOURCE_URI_PREFIX`, default `''`).

  - **Interface**: IStartupService
    - **Methods**:
      - `init(onMessage: onMessageFunction, loggerService?: ILoggerService, parConsumerStreamNames?: string[], parProducerStreamName?: string): Promise<boolean>`: Initializes the startup service.
      - `initProducer(loggerService?: ILoggerService, parProducerStreamName?: string): Promise<boolean>`: Initializes the producer stream.
      - `handleResponse(response: object, subject?: string[]): Promise<void>`: Handles responses.
      - `initServiceChannelProducer?(loggerService?: ILoggerService): Promise<boolean>`: (optional) Connects the service-channel producer.
      - `publishServiceChannel?(body: Uint8Array, subject?: string): Promise<void>`: (optional) Publishes opaque bytes to a service-channel subject.
      - `initServiceChannel?(onMessage: (data: Uint8Array) => void | Promise<void>, subject?: string, loggerService?: ILoggerService): Promise<boolean>`: (optional) Subscribes to a service-channel subject.

  - **Interface**: ILoggerService
    - **Methods**:
      - `log(message: string): void`: Logs a message.
      - `warn(message: string): void`: Logs a warning message.
      - `error(message: string | Error): void`: Logs an error message.

  - **Interface**: IRelayService
    - **Methods**:
      - `relay(data: Uint8Array): void'`: Relays a message

  - **Interface**: IRelayConfig
    - **Properties**:
      - `destinationType: 'nats' | 'rabbitmq' | 'rest'`: The type of service to relay to.
      - `destinationUrl: string`: Endpoint to relay messages to
      - `producerStream: string`: Read from the startup config
4. **Types**

  - **onMessageFunction**
    - **Type**: `(reqObj: unknown, handleResponse: responseCallback) => Promise<void>`
      - **Description**: Represents a function to handle incoming messages.
      - **Parameters**:
        - `reqObj: unknown`: The request object.
        - `handleResponse: responseCallback`: The callback to handle the response.

  - **responseCallback**
    - **Type**: `(response: object, subject: string[]) => Promise<void>`
      - **Description**: Represents a callback function to handle responses.
      - **Parameters**:
        - `response: object`: The response object.
        - `subject: string[]`: The subject(s) to which the response should be sent.

## Sequence Diagram
```mermaid
sequenceDiagram

    participant TS as Transaction<br>System
    participant TMS as Transaction<br>Monitoring<br>Service API
    participant ED as Event<br>Director
    participant RP as Rule<br>Processors
    participant TP as Typology<br>Processor
    participant IS as Interdiction<br>Service
    participant TADP as Transaction Aggregation<br>and<br>Decisioning Processor
    participant AS as Alert<br>Service
    participant CMS as Case<br>Management<br>System
    participant NATS as NATS<br>Service

    %% Startup Section %%
    note over TS: Setup - init(func, logger, consumer[], producer)
    ED ->> NATS: init(func, logger, "event-director",)
    RP ->> NATS: init(func, logger, ["sub-rule-xxx"],"pub-rule-xxx") per rule processor
    TP ->> NATS: init(func, logger, ["pub-rule-xxx"],"temp-pub-tadp") per typology
    IS ->> NATS: init(func, logger, ["typology-yyy"],{external})
    TADP ->> NATS: init(func, logger, ["typology-yyy"],{})
    AS ->> NATS: init(func, logger, ["tadp"],{external})

    %% Publish Section %%
    note over TS: Publish
    TS ->> TMS: POST(transaction)
    TMS ->> ED: publish to "event-director"
    ED ->> RP: publish to "sub-rule-xxx"
    RP ->> TP: publish to "pub-rule-xxx"
    TP ->> IS: interdiction: publish to "interdiction-service"
    IS ->> TS: interdiction(typology result)
    TP ->> TADP: publish to "typology-yyy"
    TADP ->> AS: alert: publish to "alert-service"
    AS ->> CMS: alert(evaluationResult)
```

```mermaid
flowchart LR

    TS[Transaction<br>System] --> TMS[Transaction<br>Monitoring<br>Service API]
    TMS --> EDin[event-director]:::nats
    EDin --> ED[Event<br>Director]
    ED --> RPin001[sub-rule-001@1.0.0]:::nats & RPin500[...]:::nats & RPin999[sub-rule-999@1.0.0]:::nats
    RPin001 --> RP001[Rule<br>Processor<br>001]
    RPin500 --> RP500[...]
    RPin999 --> RP999[Rule<br>Processor<br>999]
    RP001 --> RPout001[pub-rule-001@1.0.0]:::nats
    RP500 --> RPout500[...]:::nats
    RP999 --> RPout999[pub-rule-999@1.0.0]:::nats
    RPout001 --> TypP[Typology<br>Processor]
    RPout500 --> TypP[Typology<br>Processor]
    RPout999 --> TypP[Typology<br>Processor]
    TypP --> Typ001[typology-001@1.0.0]:::nats & Typ500[...]:::nats & Typ999[typology-999@1.0.0]:::nats & IS[interdiction-service]:::nats
    Typ001 --> TADP[Transaction Aggregation<br>and<br>Decisioning Processor]
    Typ500 --> TADP
    Typ999 --> TADP
    TADP --> AS[Alert<br>Service]:::nats

    NATS[NATS<br>Subject]:::nats

    classDef nats stroke:#00f,stroke-width:4px;
```


## Configuration

### Environment Variables

The `frms-coe-startup-lib` library uses environment variables to configure the startup process and service connections. Key environment variables include:

- `NODE_ENV`: The node environment (`development`, `production`, etc.).
- `SERVER_URL`: The URL of the server (e.g., NATS server).
- `FUNCTION_NAME`: The name of the function or service. Enforced `/`-free at startup (dots are allowed).
- `PRODUCER_STREAM`: Optional. The default producer stream used by `handleResponse` when no explicit subject is supplied. Services that route every message to a run-time-computed subject can leave this unset.
- `CONSUMER_STREAM`: The name of the consumer stream.

#### Service Channel Variables

- `SERVICE_CHANNEL_PRODUCER`: Optional. The service-channel subject this service publishes to. Required only when the service-channel publish primitive is used without an explicit subject.
- `SERVICE_CHANNEL_CONSUMER`: Optional. The service-channel subject this service subscribes to. Required only when the service-channel subscribe primitive is used without an explicit subject.
- `SERVICE_CHANNEL_SOURCE_URI_PREFIX`: Optional (default `''`). Deployment-wide `source`-URI prefix concatenated with `FUNCTION_NAME` to compose a CloudEvents `source`.

### Relay Environment Variables

- `DESTINATION_URL`: Specifies the startup type (`nats`).
- `DESTINATION_TYPE`: The node environment (`development`, `production`, etc.).

#### NATS-Specific Relay Variables
- `PRODUCER_STREAM`: The destination to relay messages to

#### Rest-Specific Relay Variables
- `JSON_PAYLOAD`: Convert the message to json before relaying
- `MAX_SOCKETS`: Max http/https sockets limit

#### RabbitMQ-Specific Relay Variables
- `QUEUE`: Name of the queue for the RabbitMQ producer

#### Google Cloud Bucket-Specific Relay Variables
- `GOOGLE_BUCKET_NAME`: Name of the google bucket you are planning to save to.
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to the service account key file required to connect to the bucket.

### Configuration Files

The library supports configuration through [`.env`](.env.template.nats) files or other configuration file formats. These files can be used to set environment variables and other settings.

### Logging Configuration

Logging can be configured using environment variables or configuration files. Options include:

- **Log Levels**: Set the desired log level (e.g., `info`, `debug`, `warn`).
- **Log Outputs**: Specify where the logs should be sent (console, file, external services).

### Stream and Subject Configuration

The library can be configured to interact with specific streams and subjects in the message broker. These are specified using the `PRODUCER_STREAM` and `CONSUMER_STREAM` environment variables. `CONSUMER_STREAM` is required to subscribe; `PRODUCER_STREAM` is an optional default destination - it is only consulted by `handleResponse` when the caller does not supply an explicit subject.

## Contributing

If you want to contribute to the `frms-coe-startup-lib`, please clone the repository and submit a pull request to the `dev` branch.

## License

This library is a component of the Tazama project. The Tazama project is licensed under the Apache 2.0 License.