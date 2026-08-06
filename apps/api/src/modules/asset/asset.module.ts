import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';

import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';

@Module({
  imports: [AccountingModule],
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
