# frms-coe-lib

FRMS Center of Excellence startup library.

## Installation

A personal access token is required to install this repository. For more information read the following.
https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages#about-scopes-and-permissions-for-package-registries

Thereafter you can run 
  > npm install @frmscoe/frms-coe-lib

## Usage

On Startup Initialise the library.

```ts
// Import functionality and types
import { StartupFactory, IStartupService } from "@frmscoe/frms-coe-startup-lib";

// Initialise Server, and provide a function to be called when a incomming NATS message is received.
server = new StartupFactory();
for (let retryCount = 0; retryCount < 10; retryCount++) {
  console.log(`Connecting to nats server...`);
  if (!(await server.init(handleTransaction))) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } else {
    console.log(`Connected to nats`);
    break;
  }
}

  // Inside your function when you want to publish a message:
  server.handleResponse(transaction);
```

## Environmental Variables
  
| Variable | Value | Description |
| --- | --- | --- |
| STARTUP_TYPE | 'nats' or 'jetstream' | Server Startup Type |
| NODE_ENV | debug, dev, prod, test | Node Environment Type |
| SERVER_URL | 0.0.0.0:4222 | NATS Server Address |
| FUNCTION_NAME | function | Processor Name, used for durable name |
| PRODUCER_STREAM | processorName | Stream the application will use to publish messages. |
| CONSUMER_STREAM | processorName | Processor will receive messages from this stream. |
| STREAM_SUBJECT | subjectName | Subject within consumer stream processor is listening on. |
| PRODUCER_RETENTION_POLICY | 'Limits', 'Interest', 'Workqueue' | Defaults to 'Workqueue' |
| ACK_POLICY | 'All','Explicit' | Defaults to 'Explicit' |
| PRODUCER_STORAGE | 'File','Memory' | Defaults to 'Memory' |

## FRMS Reccomended Setup - Jetstream

![Preview Image](<Documentation/stream-setup-js/FRM Jetstream Setup.png>)