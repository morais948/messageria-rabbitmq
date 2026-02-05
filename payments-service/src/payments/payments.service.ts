import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { OrderCreatedEvent, PaymentProcessedEvent } from '../interfaces/events.interface';

@Injectable()
export class PaymentsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    private rabbitMQService: RabbitMQService,
  ) {}

  async onApplicationBootstrap() {
    // Executa após TODA aplicação estar inicializada (incluindo RabbitMQ)
    await this.listenToOrderCreated();
  }

  // Processa um pagamento
  private async processPayment(orderId: number, amount: number) {
    console.log(`💳 Processando pagamento do pedido #${orderId}...`);

    // Simula processamento de pagamento (70% de chance de sucesso)
    const isSuccess = Math.random() > 0.3;
    
    // Simula delay de processamento
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const payment = this.paymentsRepository.create({
      orderId,
      amount,
      status: isSuccess ? 'PAID' : 'FAILED',
      transactionId: isSuccess ? `TXN-${Date.now()}` : null,
      message: isSuccess
        ? 'Pagamento processado com sucesso'
        : 'Falha no processamento do pagamento',
    });

    const savedPayment = await this.paymentsRepository.save(payment);
    console.log('💾 Pagamento salvo no banco:', savedPayment);

    return savedPayment;
  }

  // Escuta mensagens de pedido criado
  private async listenToOrderCreated() {
    await this.rabbitMQService.consume(
      this.rabbitMQService.getOrderCreatedQueue(),
      async (message: OrderCreatedEvent) => {
        console.log(`🔔 Novo pedido recebido! ID: ${message.orderId}`);

        // Processa o pagamento
        const payment = await this.processPayment(message.orderId, message.amount);

        // Publica evento de pagamento processado
        const event: PaymentProcessedEvent = {
          orderId: message.orderId,
          status: payment.status as 'PAID' | 'FAILED',
          message: payment.message,
          timestamp: new Date(),
        };

        await this.rabbitMQService.publish(
          this.rabbitMQService.getPaymentProcessedRoutingKey(),
          event,
        );
      },
    );
  }

  // Busca todos os pagamentos
  async findAll() {
    return this.paymentsRepository.find({
      order: { processedAt: 'DESC' },
    });
  }

  // Busca pagamentos por orderId
  async findByOrderId(orderId: number) {
    return this.paymentsRepository.findOne({ where: { orderId } });
  }
}
