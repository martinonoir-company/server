import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  MoveCategoryDto,
} from './dto/category.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';

@Controller({ path: 'categories', version: '1' })
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    const category = await this.categoriesService.create(dto);
    return { data: category };
  }

  @Get()
  @Public()
  async findAll() {
    const categories = await this.categoriesService.findAll();
    return { data: categories };
  }

  @Get('tree')
  @Public()
  async findTree() {
    const tree = await this.categoriesService.findTree();
    return { data: tree };
  }

  @Get('slug/:slug')
  @Public()
  async findBySlug(@Param('slug') slug: string) {
    const category = await this.categoriesService.findBySlug(slug);
    return { data: category };
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id') id: string) {
    const category = await this.categoriesService.findOne(id);
    return { data: category };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const category = await this.categoriesService.update(id, dto);
    return { data: category };
  }

  @Patch(':id/move')
  async move(@Param('id') id: string, @Body() dto: MoveCategoryDto) {
    const category = await this.categoriesService.move(id, dto);
    return { data: category };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.categoriesService.remove(id);
    return { message: 'Category deactivated' };
  }
}
