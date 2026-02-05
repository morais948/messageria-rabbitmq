import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './orders/orders.module';
import { Order } from './entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'orders_user',
      password: 'orders_pass',
      database: 'orders_db',
      entities: [Order],
      synchronize: true, // Apenas para desenvolvimento
    }),
    OrdersModule,
  ],
})
export class AppModule {}
