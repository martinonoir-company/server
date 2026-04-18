import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsString, ArrayMaxSize } from 'class-validator';
import { MediaService } from './media.service';
import { ConfirmUploadDto, PresignUploadDto } from './dto/media.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

class ReorderDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  orderedIds!: string[];
}

@Controller({ path: 'media', version: '1' })
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  async presign(@Body() dto: PresignUploadDto) {
    const result = await this.media.presignUpload({
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
      productId: dto.productId,
    });
    return { data: result };
  }

  @Post('confirm')
  async confirm(@Body() dto: ConfirmUploadDto) {
    const media = await this.media.confirmUpload({
      productId: dto.productId,
      key: dto.key,
      altText: dto.altText,
      sortOrder: dto.sortOrder,
    });
    return { data: media };
  }

  @Patch('product/:productId/reorder')
  async reorder(
    @Param('productId') productId: string,
    @Body() dto: ReorderDto,
  ) {
    const media = await this.media.reorder(productId, dto.orderedIds);
    return { data: media };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.media.deleteMedia(id);
  }
}
