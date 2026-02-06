import { Test, TestingModule } from '@nestjs/testing';
import { RabbitMQService } from './rabbitmq.service';

// Mock do amqp-connection-manager
jest.mock('amqp-connection-manager', () => ({
  connect: jest.fn(),
}));

describe('RabbitMQService (Payments)', () => {
  let service: RabbitMQService;
  let mockChannelWrapper;
  let mockConnection;
  let mockChannel;

  beforeEach(async () => {
    // Setup dos mocks
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockChannelWrapper = {
      waitForConnect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(undefined),
      addSetup: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockReturnValue(mockChannelWrapper),
      close: jest.fn().mockResolvedValue(undefined),
    };

    const amqp = require('amqp-connection-manager');
    amqp.connect.mockReturnValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RabbitMQService],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('deve conectar ao RabbitMQ quando o módulo é inicializado', async () => {
      // Act
      await service.onModuleInit();

      // Assert
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannelWrapper.waitForConnect).toHaveBeenCalled();
    });

    it('deve configurar o exchange, filas e bindings', async () => {
      // Arrange
      let setupFn;
      mockConnection.createChannel.mockImplementation(({ setup }) => {
        setupFn = setup;
        return mockChannelWrapper;
      });

      // Act
      await service.onModuleInit();
      if (setupFn) {
        await setupFn(mockChannel);
      }

      // Assert
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'orders_exchange',
        'topic',
        { durable: true },
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'order.created',
        { durable: true },
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'payment.processed',
        { durable: true },
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('deve fechar conexão e channel quando o módulo é destruído', async () => {
      // Arrange
      await service.onModuleInit();

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(mockChannelWrapper.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('deve publicar uma mensagem de pagamento processado', async () => {
      // Arrange
      const routingKey = 'payment.processed';
      const message = {
        orderId: 1,
        status: 'PAID',
        message: 'Pagamento processado com sucesso',
      };

      // Act
      await service.publish(routingKey, message);

      // Assert
      expect(mockChannelWrapper.publish).toHaveBeenCalledWith(
        'orders_exchange',
        routingKey,
        message,
        { persistent: true },
      );
    });

    it('deve lançar erro se a publicação falhar', async () => {
      // Arrange
      mockChannelWrapper.publish.mockRejectedValueOnce(
        new Error('Erro de conexão'),
      );

      const routingKey = 'payment.processed';
      const message = { test: 'data' };

      // Act & Assert
      await expect(service.publish(routingKey, message)).rejects.toThrow(
        'Erro de conexão',
      );
    });
  });

  describe('consume', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('deve registrar consumidor para fila de pedidos criados', async () => {
      // Arrange
      const queue = 'order.created';
      const callback = jest.fn().mockResolvedValue(undefined);

      mockChannelWrapper.addSetup.mockImplementation(async (setup) => {
        await setup(mockChannel);
      });

      // Act
      await service.consume(queue, callback);

      // Assert
      expect(mockChannelWrapper.addSetup).toHaveBeenCalled();
      expect(mockChannel.consume).toHaveBeenCalledWith(
        queue,
        expect.any(Function),
        { noAck: false },
      );
    });

    it('deve fazer ACK após processar mensagem com sucesso', async () => {
      // Arrange
      const queue = 'order.created';
      const callback = jest.fn().mockResolvedValue(undefined);
      let consumeCallback;

      mockChannel.consume.mockImplementation((q, cb) => {
        consumeCallback = cb;
      });
      mockChannelWrapper.addSetup.mockImplementation(async (setup) => {
        await setup(mockChannel);
      });

      const mockMessage = {
        content: Buffer.from(
          JSON.stringify({
            orderId: 1,
            customerName: 'João',
            product: 'Notebook',
            amount: 3000,
          }),
        ),
      };

      // Act
      await service.consume(queue, callback);

      if (consumeCallback) {
        await consumeCallback(mockMessage);
      }

      // Assert
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('deve fazer NACK quando houver erro no processamento', async () => {
      // Arrange
      const queue = 'order.created';
      const error = new Error('Erro ao processar pagamento');
      const callback = jest.fn().mockRejectedValue(error);
      let consumeCallback;

      mockChannel.consume.mockImplementation((q, cb) => {
        consumeCallback = cb;
      });
      mockChannelWrapper.addSetup.mockImplementation(async (setup) => {
        await setup(mockChannel);
      });

      const mockMessage = {
        content: Buffer.from(JSON.stringify({ orderId: 1 })),
      };

      // Act
      await service.consume(queue, callback);

      if (consumeCallback) {
        await consumeCallback(mockMessage);
      }

      // Assert
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });
  });

  describe('Getters', () => {
    it('deve retornar getOrderCreatedQueue', () => {
      // Act
      const queue = service.getOrderCreatedQueue();

      // Assert
      expect(queue).toBe('order.created');
    });

    it('deve retornar getPaymentProcessedRoutingKey', () => {
      // Act
      const key = service.getPaymentProcessedRoutingKey();

      // Assert
      expect(key).toBe('payment.processed');
    });
  });
});
