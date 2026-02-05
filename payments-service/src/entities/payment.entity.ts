import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column()
  status: string; // PAID, FAILED

  @Column({ nullable: true })
  transactionId: string;

  @Column({ nullable: true })
  message: string;

  @CreateDateColumn()
  processedAt: Date;
}
