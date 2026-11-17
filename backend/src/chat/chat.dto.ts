import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  EFFORTS,
  Effort,
  MODEL_TIERS,
  ModelTier,
  TECHNICALITIES,
  Technicality,
} from './answer.config';

/** A message as the LLM layer sees it. */
export class MessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  content: string;
}

/** Body of POST /chat. Omit chatId to start a new conversation. */
export class SendMessageDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'Invalid chat id.' })
  chatId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message: string;

  /** auto = router decides; general = no law search; law = search `domain` only. */
  @IsOptional()
  @IsIn(['auto', 'general', 'law'])
  mode?: AnswerMode;

  @ValidateIf((o) => o.mode === 'law')
  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/, { message: 'Invalid law database id.' })
  domain?: string;

  /** Which local model answers (see answer.config.ts). */
  @IsOptional()
  @IsIn(MODEL_TIERS)
  model?: ModelTier;

  @IsOptional()
  @IsIn(EFFORTS)
  effort?: Effort;

  @IsOptional()
  @IsIn(TECHNICALITIES)
  technicality?: Technicality;

  /** A file uploaded via POST /files. It stays attached to the chat for follow-ups. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'Invalid file id.' })
  attachmentId?: string;
}

export type AnswerMode = 'auto' | 'general' | 'law';
