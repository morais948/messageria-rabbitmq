import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(
    @Body() createOrderDto: { customerName: string; product: string; amount: number },
  ) {
    return this.ordersService.createOrder(
      createOrderDto.customerName,
      createOrderDto.product,
      createOrderDto.amount,
    );
  }

  @Get()
  async findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id); //conerte para number
  }
}
