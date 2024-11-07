import { type IRelay } from '../interfaces/iRelayService';
import type { Connection, Channel } from 'amqplib';
import amqplib from 'amqplib';

export class RabbitMQ implements IRelay {
  private connection?: Connection;
  private channel?: Channel;
  async init(): Promise<void> {
    // validate rabbit env here
    this.connection = await amqplib.connect('');
    this.channel = await this.connection.createChannel();

    await this.channel.assertQueue('', { durable: false });
  }
  async relay(data: Uint8Array): Promise<void> {
    if (!this.channel || !this.connection) {
      throw new Error('RabbitMQ is not initialised. Call init()');
    }
    this.channel.sendToQueue('config.queue', Buffer.from(data));
  }
}
