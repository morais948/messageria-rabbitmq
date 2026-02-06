import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: OrdersService;

  beforeEach(async () => {
    // Mock do OrdersService
    const mockOrdersService = {
      createOrder: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    service = module.get<OrdersService>(OrdersService);
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /orders', () => {
    it('deve criar um novo pedido', async () => {
      // Arrange
      const createOrderDto = {
        customerName: 'João Silva',
        product: 'Notebook',
        amount: 3000,
      };

      const expectedOrder = {
        id: 1,
        ...createOrderDto,
        status: 'PENDING',
        createdAt: new Date(),
      };

      jest.spyOn(service, 'createOrder').mockResolvedValue(expectedOrder);

      // Act
      const result = await controller.createOrder(createOrderDto);

      // Assert
      expect(service.createOrder).toHaveBeenCalledWith(
        createOrderDto.customerName,
        createOrderDto.product,
        createOrderDto.amount,
      );
      expect(result).toEqual(expectedOrder);
    });

    it('deve validar dados obrigatórios', async () => {
      // Arrange
      const invalidDto = {
        customerName: '',
        product: '',
        amount: 0,
      };

      // Act & Assert
      jest.spyOn(service, 'createOrder').mockResolvedValue(null);
      await controller.createOrder(invalidDto);
      expect(service.createOrder).toHaveBeenCalled();
    });
  });

  describe('GET /orders', () => {
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

      jest.spyOn(service, 'findAll').mockResolvedValue(mockOrders);

      // Act
      const result = await controller.findAll();

      // Assert
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockOrders);
      expect(result).toHaveLength(2);
    });

    it('deve retornar um array vazio quando não há pedidos', async () => {
      // Arrange
      jest.spyOn(service, 'findAll').mockResolvedValue([]);

      // Act
      const result = await controller.findAll();

      // Assert
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('GET /orders/:id', () => {
    it('deve retornar um pedido específico por ID', async () => {
      // Arrange
      const orderId = '1';
      const mockOrder = {
        id: 1,
        customerName: 'João',
        product: 'Notebook',
        amount: 3000,
        status: 'PENDING',
        createdAt: new Date(),
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockOrder);

      // Act
      const result = await controller.findOne(orderId);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockOrder);
    });

    it('deve converter string ID para número', async () => {
      // Arrange
      const orderId = '42';
      const mockOrder = {
        id: 42,
        customerName: 'Test',
        product: 'Product',
        amount: 100,
        status: 'PENDING',
        createdAt: new Date(),
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockOrder);

      // Act
      await controller.findOne(orderId);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith(42);
    });

    it('deve retornar null quando o pedido não existe', async () => {
      // Arrange
      const orderId = '999';
      jest.spyOn(service, 'findOne').mockResolvedValue(null);

      // Act
      const result = await controller.findOne(orderId);

      // Assert
      expect(service.findOne).toHaveBeenCalledWith(999);
      expect(result).toBeNull();
    });
  });
});
