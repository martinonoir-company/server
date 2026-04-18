import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UsersService } from './users.service';
import { AccountController } from './account.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role])],
  controllers: [AccountController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}

