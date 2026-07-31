import { Module } from '@nestjs/common';

import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  controllers: [UserController, RoleController],
  providers: [UserService, RoleService],
})
export class AdminModule {}
