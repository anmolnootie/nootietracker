import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { POService } from './po.service';
import { CreatePORequest, POStatus } from '@po-control-tower/shared';

@Controller('pos')
@UseGuards(AuthGuard('jwt'))
export class POController {
  constructor(private poService: POService) {}

  @Post()
  async createPO(
    @Body() createPODto: CreatePORequest,
    @Request() req: any,
  ) {
    return this.poService.createPO(createPODto, req.user.userId);
  }

  @Get()
  async getAllPOs(
    @Query('channelId') channelId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: POStatus,
    @Query('risk') risk?: string,
  ) {
    return this.poService.getAllPOs({
      channelId,
      customerId,
      status,
      risk,
    });
  }

  @Get('dashboard/metrics')
  async getDashboardMetrics() {
    return this.poService.getDashboardMetrics();
  }

  @Get(':poId')
  async getPOById(@Param('poId') poId: string) {
    return this.poService.getPOById(poId);
  }

  @Get(':poId/line-items')
  async getLineItems(@Param('poId') poId: string) {
    return this.poService.getPOLineItems(poId);
  }

  @Post(':poId/appointment/request')
  async requestAppointment(@Param('poId') poId: string) {
    return this.poService.requestAppointment(poId);
  }

  @Post(':poId/appointment/confirm')
  async confirmAppointment(
    @Param('poId') poId: string,
    @Body() body: { appointmentDate: string },
  ) {
    if (!body.appointmentDate) {
      throw new BadRequestException('appointmentDate is required');
    }
    return this.poService.confirmAppointment(poId, new Date(body.appointmentDate));
  }

  @Post(':poId/dispatch/mark')
  async markDispatched(
    @Param('poId') poId: string,
    @Body() body: { docketNumber: string; transporterId: string },
  ) {
    if (!body.docketNumber || !body.transporterId) {
      throw new BadRequestException('docketNumber and transporterId are required');
    }
    return this.poService.markDispatched(poId, body.docketNumber, body.transporterId);
  }

  @Post(':poId/logistics/update-status')
  async updateLogisticsStatus(
    @Param('poId') poId: string,
    @Body() body: { status: string },
  ) {
    if (!body.status) {
      throw new BadRequestException('status is required');
    }
    return this.poService.updateLogisticsStatus(poId, body.status);
  }

  @Post(':poId/avv/mark-received')
  async markAVVReceived(@Param('poId') poId: string) {
    return this.poService.markAVVReceived(poId);
  }

  @Post(':poId/grn/record')
  async recordGRN(
    @Param('poId') poId: string,
    @Body() body: {
      grnNumber: string;
      grnValue: number;
      outcome: string;
      discrepancyReason?: string;
      discrepancyAmount?: number;
    },
  ) {
    if (!body.grnNumber || !body.grnValue || !body.outcome) {
      throw new BadRequestException('grnNumber, grnValue, and outcome are required');
    }
    return this.poService.recordGRN(poId, body);
  }
}
