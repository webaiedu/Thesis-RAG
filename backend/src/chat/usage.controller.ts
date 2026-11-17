import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UsageService } from './usage.service';

/** GET /usage: this hour's token usage, for the bar under the chat box. */
@Controller('usage')
@UseGuards(FirebaseAuthGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.usage.status(user.uid);
  }
}
