import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { POImportService } from './po-import.service';
import { POImportController } from './po-import.controller';

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  ],
  providers: [POImportService],
  controllers: [POImportController],
})
export class POImportModule {}
