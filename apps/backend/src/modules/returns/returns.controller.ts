import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReturnsService } from './returns.service';

@Controller('returns')
@UseGuards(AuthGuard('jwt'))
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  async list() {
    return this.returnsService.list();
  }

  @Post(':poId')
  async create(
    @Param('poId') poId: string,
    @Body() body: { returnType: 'RECALL_NOT_DELIVERED' | 'REJECTED_GRN' | 'DAMAGE' | 'SHORTAGE'; rootCause?: string; lossAmount?: number },
  ) {
    return this.returnsService.create(poId, body);
  }

  @Put(':id/close')
  async close(
    @Param('id') id: string,
    @Body() body: { rootCause: string; creditNoteNumber?: string; lossAmount?: number },
  ) {
    return this.returnsService.close(id, body);
  }
}
