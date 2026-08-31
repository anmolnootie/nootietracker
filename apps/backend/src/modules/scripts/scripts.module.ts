import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { ScriptsController } from './scripts.controller';
import { UserModule } from '../user/user.module';
import { POModule } from '../po/po.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, POMasterEntity, POLineItemEntity]), UserModule, POModule],
  controllers: [ScriptsController],
})
export class ScriptsModule {}
