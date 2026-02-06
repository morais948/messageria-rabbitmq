import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: PaymentsService;

  beforeEach(async () => {
    // Mock do PaymentsService
    const mockPaymentsService = {
      findAll: jest.fn(),
      findByOrderId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
    service = module.get<PaymentsService>(PaymentsService);
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /payments', () => {
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

      jest.spyOn(service, 'findAll').mockResolvedValue(mockPayments);

      // Act
      const result = await controller.findAll();

      // Assert
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockPayments);
      expect(result).toHaveLength(2);
    });

    it('deve retornar um array vazio quando não há pagamentos', async () => {
      // Arrange
      jest.spyOn(service, 'findAll').mockResolvedValue([]);

      // Act
      const result = await controller.findAll();

      // Assert
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('GET /payments/order/:orderId', () => {
    it('deve retornar um pagamento específico por orderId', async () => {
      // Arrange
      const orderId = '1';
      const mockPayment = {
        id: 1,
        orderId: 1,
        amount: 3000,
        status: 'PAID',
        transactionId: 'TXN-12345',
        message: 'Pagamento processado com sucesso',
        processedAt: new Date(),
      };

      jest.spyOn(service, 'findByOrderId').mockResolvedValue(mockPayment);

      // Act
      const result = await controller.findByOrderId(orderId);

      // Assert
      expect(service.findByOrderId).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockPayment);
    });

    it('deve converter string orderId para número', async () => {
      // Arrange
      const orderId = '42';
      const mockPayment = {
        id: 1,
        orderId: 42,
        amount: 5000,
        status: 'PAID',
        transactionId: 'TXN-67890',
        message: 'Pagamento processado com sucesso',
        processedAt: new Date(),
      };

      jest.spyOn(service, 'findByOrderId').mockResolvedValue(mockPayment);

      // Act
      await controller.findByOrderId(orderId);

      // Assert
      expect(service.findByOrderId).toHaveBeenCalledWith(42);
    });

    it('deve retornar null quando o pagamento não existe para o pedido', async () => {
      // Arrange
      const orderId = '999';
      jest.spyOn(service, 'findByOrderId').mockResolvedValue(null);

      // Act
      const result = await controller.findByOrderId(orderId);

      // Assert
      expect(service.findByOrderId).toHaveBeenCalledWith(999);
      expect(result).toBeNull();
    });

    it('deve retornar um pagamento falhado', async () => {
      // Arrange
      const orderId = '2';
      const mockPayment = {
        id: 2,
        orderId: 2,
        amount: 150,
        status: 'FAILED',
        transactionId: null,
        message: 'Falha no processamento do pagamento',
        processedAt: new Date(),
      };

      jest.spyOn(service, 'findByOrderId').mockResolvedValue(mockPayment);

      // Act
      const result = await controller.findByOrderId(orderId);

      // Assert
      expect(result.status).toBe('FAILED');
      expect(result.transactionId).toBeNull();
    });
  });
});
