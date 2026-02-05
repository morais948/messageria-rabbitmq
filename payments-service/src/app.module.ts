import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from './payments/payments.module';
import { Payment } from './entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3307, // Porta diferente do orders-service
      username: 'payments_user',
      password: 'payments_pass',
      database: 'payments_db',
      entities: [Payment],
      synchronize: true, // Apenas para desenvolvimento
    }),
    PaymentsModule,
  ],
})
export class AppModule {}
