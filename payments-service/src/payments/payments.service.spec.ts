import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { Payment } from '../entities/payment.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mockPaymentsRepository;
  let mockRabbitMQService;

  beforeEach(async () => {
    // Mock do repositório TypeORM
    mockPaymentsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    // Mock do RabbitMQService
    mockRabbitMQService = {
      publish: jest.fn(),
      consume: jest.fn(),
      getOrderCreatedQueue: jest.fn().mockReturnValue('order.created'),
      getPaymentProcessedRoutingKey: jest.fn().mockReturnValue('payment.processed'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentsRepository,
        },
        {
          provide: RabbitMQService,
          useValue: mockRabbitMQService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('deve retornar todos os pagamentos', async () => {
      // Arrange
      const mockPayments = [
        {
          id: 1,
          orderId: 1,
          amount: 3000,
          status: 'PAID',
          transactionId: 'TXN-12345',
          message: 'Pagamento processado com sucesso',
          processedAt: new Date(),
        },
        {
          id: 2,
          orderId: 2,
          amount: 150,
          status: 'FAILED',
          transactionId: null,
          message: 'Falha no processamento do pagamento',
          processedAt: new Date(),
        },
      ];

      mockPaymentsRepository.find.mockResolvedValue(mockPayments);

      // Act
      const result = await service.findAll();

      // Assert
      expect(mockPaymentsRepository.find).toHaveBeenCalledWith({
        order: { processedAt: 'DESC' },
      });
      expect(result).toEqual(mockPayments);
      expect(result).toHaveLength(2);
    });

    it('deve retornar um array vazio quando não há pagamentos', async () => {
      // Arrange
      mockPaymentsRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.findAll();

      // Assert
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('findByOrderId', () => {
    it('deve retornar um pagamento específico por orderId', async () => {
      // Arrange
      const orderId = 1;
      const mockPayment = {
        id: 1,
        orderId,
        amount: 3000,
        status: 'PAID',
        transactionId: 'TXN-12345',
        message: 'Pagamento processado com sucesso',
        processedAt: new Date(),
      };

      mockPaymentsRepository.findOne.mockResolvedValue(mockPayment);

      // Act
      const result = await service.findByOrderId(orderId);

      // Assert
      expect(mockPaymentsRepository.findOne).toHaveBeenCalledWith({
        where: { orderId },
      });
      expect(result).toEqual(mockPayment);
    });

    it('deve retornar null quando o pagamento do pedido não existe', async () => {
      // Arrange
      const orderId = 999;
      mockPaymentsRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findByOrderId(orderId);

      // Assert
      expect(mockPaymentsRepository.findOne).toHaveBeenCalledWith({
        where: { orderId },
      });
      expect(result).toBeNull();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('deve registrar consumidor para OrderCreatedEvent ao iniciar', async () => {
      // Act
      await service.onApplicationBootstrap();

      // Assert
      expect(mockRabbitMQService.consume).toHaveBeenCalled();
      const callArgs = mockRabbitMQService.consume.mock.calls[0];
      expect(callArgs[0]).toBe('order.created');
      expect(typeof callArgs[1]).toBe('function');
    });
  });

  describe('processPayment', () => {
    it('deve processar pagamento com sucesso', async () => {
      // Arrange
      const orderId = 1;
      const amount = 3000;

      // Mock Math.random para garantir sucesso
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.5); // > 0.3 = sucesso

      const mockPayment = {
        id: 1,
        orderId,
        amount,
        status: 'PAID',
        transactionId: 'TXN-12345',
        message: 'Pagamento processado com sucesso',
        processedAt: new Date(),
      };

      mockPaymentsRepository.create.mockReturnValue(mockPayment);
      mockPaymentsRepository.save.mockResolvedValue(mockPayment);

      // Act
      // Usa reflexão para chamar o método privado
      const result = await (service as any).processPayment(orderId, amount);

      // Assert
      expect(mockPaymentsRepository.create).toHaveBeenCalled();
      expect(mockPaymentsRepository.save).toHaveBeenCalled();
      expect(result.status).toBe('PAID');

      // Restaurar Math.random
      Math.random = originalRandom;
    });

    it('deve processar pagamento com falha', async () => {
      // Arrange
      const orderId = 2;
      const amount = 150;

      // Mock Math.random para garantir falha
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.1); // < 0.3 = falha

      const mockPayment = {
        id: 2,
        orderId,
        amount,
        status: 'FAILED',
        transactionId: null,
        message: 'Falha no processamento do pagamento',
        processedAt: new Date(),
      };

      mockPaymentsRepository.create.mockReturnValue(mockPayment);
      mockPaymentsRepository.save.mockResolvedValue(mockPayment);

      // Act
      // Usa reflexão para chamar o método privado
      const result = await (service as any).processPayment(orderId, amount);

      // Assert
      expect(mockPaymentsRepository.create).toHaveBeenCalled();
      expect(mockPaymentsRepository.save).toHaveBeenCalled();
      expect(result.status).toBe('FAILED');
      expect(result.transactionId).toBeNull();

      // Restaurar Math.random
      Math.random = originalRandom;
    });
  });

  describe('listenToOrderCreated', () => {
    it('deve processar mensagem de pedido criado', async () => {
      // Arrange
      let consumeCallback;
      mockRabbitMQService.consume.mockImplementation((queue, callback) => {
        consumeCallback = callback;
      });

      const mockPayment = {
        id: 1,
        orderId: 1,
        amount: 3000,
        status: 'PAID',
        transactionId: 'TXN-12345',
        message: 'Pagamento processado com sucesso',
        processedAt: new Date(),
      };

      mockPaymentsRepository.create.mockReturnValue(mockPayment);
      mockPaymentsRepository.save.mockResolvedValue(mockPayment);

      // Act
      await service.onApplicationBootstrap();

      const orderCreatedEvent = {
        orderId: 1,
        customerName: 'João',
        product: 'Notebook',
        amount: 3000,
        timestamp: new Date(),
      };

      if (consumeCallback) {
        // Mock Math.random para sucesso
        const originalRandom = Math.random;
        Math.random = jest.fn().mockReturnValue(0.5);

        await consumeCallback(orderCreatedEvent);

        // Assert
        expect(mockRabbitMQService.publish).toHaveBeenCalled();
        const publishCall = mockRabbitMQService.publish.mock.calls[0];
        expect(publishCall[0]).toBe('payment.processed');
        expect(publishCall[1]).toMatchObject({
          orderId: 1,
          status: 'PAID',
        });

        Math.random = originalRandom;
      }
    });
  });
});
