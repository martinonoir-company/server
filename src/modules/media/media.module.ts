import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import {
  Product,
  ProductMedia,
} from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductMedia])],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
