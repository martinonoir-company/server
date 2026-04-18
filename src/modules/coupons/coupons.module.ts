import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from './entities/coupon.entity';
import { CouponsService } from './coupons.service';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon])],
  controllers: [],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
