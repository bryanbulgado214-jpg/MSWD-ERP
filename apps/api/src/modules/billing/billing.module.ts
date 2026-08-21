import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';

import { BillController } from './bill.controller';
import { BillService } from './bill.service';
import { BillingPeriodController } from './billing-period.controller';
import { BillingPeriodService } from './billing-period.service';
import { BillingReportController } from './billing-report.controller';
import { BillingReportService } from './billing-report.service';
import { ConsumerController } from './consumer.controller';
import { ConsumerService } from './consumer.service';
import { DisconnectionController } from './disconnection.controller';
import { DisconnectionService } from './disconnection.service';
import { MeterReadingController } from './meter-reading.controller';
import { MeterReadingService } from './meter-reading.service';
import { MeterController } from './meter.controller';
import { MeterService } from './meter.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { RateScheduleController } from './rate-schedule.controller';
import { RateScheduleService } from './rate-schedule.service';

@Module({
  imports: [AccountingModule],
  controllers: [
    ConsumerController,
    MeterController,
    RateScheduleController,
    BillingPeriodController,
    MeterReadingController,
    BillController,
    PaymentController,
    DisconnectionController,
    BillingReportController,
  ],
  providers: [
    ConsumerService,
    MeterService,
    RateScheduleService,
    BillingPeriodService,
    MeterReadingService,
    BillService,
    PaymentService,
    DisconnectionService,
    BillingReportService,
  ],
  exports: [
    ConsumerService,
    MeterService,
    RateScheduleService,
    BillingPeriodService,
    MeterReadingService,
    BillService,
    PaymentService,
    DisconnectionService,
    BillingReportService,
  ],
})
export class BillingModule {}
