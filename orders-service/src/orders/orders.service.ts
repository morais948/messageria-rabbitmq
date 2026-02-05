import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { OrderCreatedEvent, PaymentProcessedEvent } from '../interfaces/events.interface';

@Injectable()
export class OrdersService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private rabbitMQService: RabbitMQService,
  ) {}

  async onApplicationBootstrap() {
    // Executa após TODA aplicação estar inicializada (incluindo RabbitMQ)
    await this.listenToPaymentProcessed();
  }

  // Cria um novo pedido
  async createOrder(customerName: string, product: string, amount: number) {
    // 1. Salva o pedido no banco de dados
    const order = this.ordersRepository.create({
      customerName,
      product,
      amount,
      status: 'PENDING',
    });

    const savedOrder = await this.ordersRepository.save(order);
    console.log('💾 Pedido salvo no banco:', savedOrder);

    // 2. Publica evento de pedido criado no RabbitMQ
    const event: OrderCreatedEvent = {
      orderId: savedOrder.id,
      customerName: savedOrder.customerName,
      product: savedOrder.product,
      amount: Number(savedOrder.amount),
      timestamp: new Date(),
    };

    await this.rabbitMQService.publish(
      this.rabbitMQService.getOrderCreatedRoutingKey(),
      event,
    );

    return savedOrder;
  }

  // Busca todos os pedidos
  async findAll() {
    return this.ordersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Busca um pedido por ID
  async findOne(id: number) {
    return this.ordersRepository.findOne({ where: { id } });
  }

  // Escuta mensagens de pagamento processado
  private async listenToPaymentProcessed() {
    await this.rabbitMQService.consume(
      this.rabbitMQService.getPaymentProcessedQueue(),
      async (message: PaymentProcessedEvent) => {
        // Atualiza o status do pedido baseado no resultado do pagamento
        const order = await this.ordersRepository.findOne({
          where: { id: message.orderId },
        });

        if (order) {
          order.status = message.status;
          await this.ordersRepository.save(order);
          console.log(`✅ Pedido #${order.id} atualizado para ${message.status}`);
        }
      },
    );
  }
}
