import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel } from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;

  // Definição das filas e exchanges
  private readonly EXCHANGE = 'orders_exchange';
  private readonly ORDER_CREATED_QUEUE = 'order.created';
  private readonly PAYMENT_PROCESSED_QUEUE = 'payment.processed';
  private readonly ORDER_CREATED_ROUTING_KEY = 'order.created';
  private readonly PAYMENT_PROCESSED_ROUTING_KEY = 'payment.processed';

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.channelWrapper.close();
    await this.connection.close();
  }

  private async connect() {
    // Cria a conexão com o RabbitMQ
    this.connection = amqp.connect(['amqp://admin:admin123@localhost:5672']);

    // Cria um canal (channel wrapper)
    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        // Declara o exchange do tipo 'topic'
        // Topic permite roteamento baseado em padrões
        await channel.assertExchange(this.EXCHANGE, 'topic', { durable: true });

        // Declara as filas
        await channel.assertQueue(this.ORDER_CREATED_QUEUE, { durable: true });
        await channel.assertQueue(this.PAYMENT_PROCESSED_QUEUE, { durable: true });

        // Vincula as filas ao exchange com routing keys
        await channel.bindQueue(
          this.ORDER_CREATED_QUEUE,
          this.EXCHANGE,
          this.ORDER_CREATED_ROUTING_KEY,
        );

        await channel.bindQueue(
          this.PAYMENT_PROCESSED_QUEUE,
          this.EXCHANGE,
          this.PAYMENT_PROCESSED_ROUTING_KEY,
        );

        console.log('✅ RabbitMQ configurado com sucesso!');
      },
    });

    // Aguarda a conexão estar pronta
    await this.channelWrapper.waitForConnect();
  }

  // Publica uma mensagem no exchange
  async publish(routingKey: string, message: any) {
    try {
      await this.channelWrapper.publish(
        this.EXCHANGE,
        routingKey,
        message,
        { persistent: true } as any, // Mensagem persiste em disco
      );
      console.log(`📤 Mensagem publicada [${routingKey}]:`, message);
    } catch (error) {
      console.error('❌ Erro ao publicar mensagem:', error);
      throw error;
    }
  }

  // Consome mensagens de uma fila
  async consume(queue: string, callback: (message: any) => Promise<void>) {
    await this.channelWrapper.addSetup(async (channel: Channel) => {
      await channel.consume(
        queue,
        async (msg) => {
          if (msg) {
            const content = JSON.parse(msg.content.toString());
            console.log(`📥 Mensagem recebida de [${queue}]:`, content);

            try {
              await callback(content);
              // ACK - confirma que a mensagem foi processada
              channel.ack(msg);
              console.log('✅ Mensagem processada com sucesso');
            } catch (error) {
              console.error('❌ Erro ao processar mensagem:', error);
              // NACK - rejeita a mensagem (pode ser reenfileirada)
              channel.nack(msg, false, false);
            }
          }
        },
        { noAck: false }, // Requer confirmação manual
      );
    });
  }

  // Getters para usar as constantes em outros serviços
  getOrderCreatedRoutingKey() {
    return this.ORDER_CREATED_ROUTING_KEY;
  }

  getPaymentProcessedQueue() {
    return this.PAYMENT_PROCESSED_QUEUE;
  }
}
