import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { DomainsController } from './domains.controller';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LlmService } from './llm.service';
import { RetrievalService } from './retrieval.service';
import { RouterService } from './router.service';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  controllers: [ChatController, ChatsController, DomainsController, FilesController, UsageController],
  providers: [ChatService, ChatsService, FilesService, RetrievalService, RouterService, LlmService, UsageService],
})
export class ChatModule {}
