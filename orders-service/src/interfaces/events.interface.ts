export interface OrderCreatedEvent {
  orderId: number;
  customerName: string;
  product: string;
  amount: number;
  timestamp: Date;
}

export interface PaymentProcessedEvent {
  orderId: number;
  status: 'PAID' | 'FAILED';
  message: string;
  timestamp: Date;
}
