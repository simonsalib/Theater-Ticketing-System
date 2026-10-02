import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SeatAuditService } from './seat-audit.service';

@Module({
  imports: [MailModule],
  providers: [SeatAuditService],
  exports: [SeatAuditService],
})
export class SeatAuditModule {}
