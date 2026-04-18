import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, CustomerAddress } from './entities/customer.entity';
import { CustomersService } from './customers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerAddress])],
  controllers: [],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
