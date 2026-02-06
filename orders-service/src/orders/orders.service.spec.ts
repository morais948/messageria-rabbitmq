import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { Order } from '../entities/order.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let mockOrdersRepository;
  let mockRabbitMQService;

  beforeEach(async () => {
    // Mock do repositório TypeORM
    mockOrdersRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    // Mock do RabbitMQService
    mockRabbitMQService = {
      publish: jest.fn(),
      consume: jest.fn(),
      getOrderCreatedRoutingKey: jest.fn().mockReturnValue('order.created'),
      getPaymentProcessedQueue: jest.fn().mockReturnValue('payment.processed'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrdersRepository,
        },
        {
          provide: RabbitMQService,
          useValue: mockRabbitMQService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('createOrder', () => {
    it('deve criar um novo pedido com sucesso', async () => {
      // Arrange
      const customerName = 'João Silva';
      const product = 'Notebook';
      const amount = 3000;

      const mockOrder = {
        id: 1,
        customerName,
        product,
        amount,
        status: 'PENDING',
        createdAt: new Date(),
      };

      mockOrdersRepository.create.mockReturnValue(mockOrder);
      mockOrdersRepository.save.mockResolvedValue(mockOrder);

      // Act
      const result = await service.createOrder(customerName, product, amount);

      // Assert
      expect(mockOrdersRepository.create).toHaveBeenCalledWith({
        customerName,
        product,
        amount,
        status: 'PENDING',
      });
      expect(mockOrdersRepository.save).toHaveBeenCalledWith(mockOrder);
      expect(mockRabbitMQService.publish).toHaveBeenCalled();
      expect(result).toEqual(mockOrder);
    });

    it('deve publicar um evento OrderCreatedEvent', async () => {
      // Arrange
      const customerName = 'Maria Santos';
      const product = 'Mouse';
      const amount = 150;

      const mockOrder = {
        id: 2,
        customerName,
        product,
        amount,
        status: 'PENDING',
        createdAt: new Date(),
      };

      mockOrdersRepository.create.mockReturnValue(mockOrder);
      mockOrdersRepository.save.mockResolvedValue(mockOrder);

      // Act
      await service.createOrder(customerName, product, amount);

      // Assert
      const publishCall = mockRabbitMQService.publish.mock.calls[0];
      expect(publishCall[0]).toBe('order.created');
      expect(publishCall[1]).toMatchObject({
        orderId: 2,
        customerName,
        product,
        amount,
      });
    });
  });

  describe('findAll', () => {
    it('deve retornar todos os pedidos', async () => {
      // Arrange
      const mockOrders = [
        {
          id: 1,
          customerName: 'João',
          product: 'Notebook',
          amount: 3000,
          status: 'PENDING',
          createdAt: new Date(),
        },
        {
          id: 2,
          customerName: 'Maria',
          product: 'Mouse',
          amount: 150,
          status: 'PAID',
          createdAt: new Date(),
        },
      ];

      mockOrdersRepository.find.mockResolvedValue(mockOrders);

      // Act
      const result = await service.findAll();

      // Assert
      expect(mockOrdersRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(mockOrders);
      expect(result).toHaveLength(2);
    });

    it('deve retornar um array vazio quando não há pedidos', async () => {
      // Arrange
      mockOrdersRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.findAll();

      // Assert
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('deve retornar um pedido específico por ID', async () => {
      // Arrange
      const orderId = 1;
      const mockOrder = {
        id: orderId,
        customerName: 'João',
        product: 'Notebook',
        amount: 3000,
        status: 'PENDING',
        createdAt: new Date(),
      };

      mockOrdersRepository.findOne.mockResolvedValue(mockOrder);

      // Act
      const result = await service.findOne(orderId);

      // Assert
      expect(mockOrdersRepository.findOne).toHaveBeenCalledWith({
        where: { id: orderId },
      });
      expect(result).toEqual(mockOrder);
    });

    it('deve retornar null quando o pedido não existe', async () => {
      // Arrange
      const orderId = 999;
      mockOrdersRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findOne(orderId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('deve registrar consumidor para PaymentProcessedEvent ao iniciar', async () => {
      // Act
      await service.onApplicationBootstrap();

      // Assert
      expect(mockRabbitMQService.consume).toHaveBeenCalled();
      const callArgs = mockRabbitMQService.consume.mock.calls[0];
      expect(callArgs[0]).toBe('payment.processed');
    });
  });
});
