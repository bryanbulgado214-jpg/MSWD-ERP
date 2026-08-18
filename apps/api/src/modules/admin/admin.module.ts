import { Module } from '@nestjs/common';

import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';
import { OrganizationProfileController } from './organization-profile.controller';
import { OrganizationProfileService } from './organization-profile.service';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  controllers: [
    UserController,
    RoleController,
    AuditLogController,
    OrganizationProfileController,
    DemoDataController,
  ],
  providers: [
    UserService,
    RoleService,
    AuditLogService,
    OrganizationProfileService,
    DemoDataService,
  ],
})
export class AdminModule {}
