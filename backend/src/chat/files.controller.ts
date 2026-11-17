import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile as Upload,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { FilesService, UploadedFile } from './files.service';

const MAX_BYTES = 20 * 1024 * 1024;

/** POST /files (multipart, field "file"): any readable file to ask questions about. */
@Controller('files')
@UseGuards(FirebaseAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  upload(@Upload() file: UploadedFile | undefined, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.files.upload(user.uid, file);
  }
}
