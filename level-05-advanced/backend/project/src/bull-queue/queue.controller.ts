import { Controller, Post, Body, Get } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailJobData } from './email.processor';

@Controller('queue')
export class QueueController {
  constructor(private readonly emailService: EmailService) {}

  @Post('email')
  async sendEmail(@Body() body: EmailJobData) {
    return this.emailService.sendEmail(body);
  }

  @Post('email/schedule')
  async scheduleEmail(@Body() body: { email: EmailJobData; delayMs: number }) {
    return this.emailService.scheduleEmail(body.email, body.delayMs);
  }

  @Get('stats')
  async stats() {
    return this.emailService.getQueueStats();
  }
}
