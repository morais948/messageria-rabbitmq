import { Controller, Get, Param } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async findAll() {
    return this.paymentsService.findAll();
  }

  @Get('order/:orderId')
  async findByOrderId(@Param('orderId') orderId: string) {
    return this.paymentsService.findByOrderId(+orderId);
  }
}
