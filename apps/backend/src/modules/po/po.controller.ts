import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { POService, SENSITIVE_PO_FIELDS } from './po.service';
import { POPdfService } from './po-pdf.service';
import { DispatchDashboardService, DISPATCH_KPIS, DispatchKpi } from './dispatch-dashboard.service';
import { EditPORequest } from './edit-po.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePORequest, POStatus, UserRole, NonFulfilmentReason } from '@po-control-tower/shared';

@Controller('pos')
@UseGuards(AuthGuard('jwt'))
export class POController {
  constructor(private poService: POService, private poPdfService: POPdfService, private dispatchDashboardService: DispatchDashboardService) {}

  @Post()
  async createPO(
    @Body() createPODto: CreatePORequest,
    @Request() req: any,
  ) {
    return this.poService.createPO(createPODto, req.user.userId);
  }

  @Get('check-duplicate/:poNumber')
  async checkDuplicate(@Param('poNumber') poNumber: string) {
    return this.poService.checkDuplicate(poNumber);
  }

  @Get('edit-meta/sensitive-fields')
  async getSensitiveFields() {
    return { fields: SENSITIVE_PO_FIELDS };
  }

  @Get()
  async getAllPOs(
    @Query('channelId') channelId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: POStatus,
    @Query('risk') risk?: string,
    @Query('view') view?: 'active' | 'at_risk' | 'expiring_soon' | 'low_value' | 'not_fulfilled',
    @Query('search') search?: string,
    @Query('location') location?: string,
    @Query('dateField') dateField?: 'poDate' | 'expiry' | 'dispatch' | 'appointment' | 'invoice',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('valueMin') valueMin?: string,
    @Query('valueMax') valueMax?: string,
    @Query('fulfilmentDecision') fulfilmentDecision?: string,
    @Query('fulfilmentStatus') fulfilmentStatus?: string,
    @Query('sourceType') sourceType?: string,
    @Query('invoiced') invoiced?: 'yes' | 'no',
    @Query('reattempt') reattempt?: 'yes' | 'no',
  ) {
    return this.poService.getAllPOs({
      channelId,
      customerId,
      status,
      risk,
      view,
      search,
      location,
      dateField,
      dateFrom,
      dateTo,
      valueMin: valueMin ? Number(valueMin) : undefined,
      valueMax: valueMax ? Number(valueMax) : undefined,
      fulfilmentDecision,
      fulfilmentStatus,
      sourceType,
      invoiced,
      reattempt,
    });
  }

  @Get('dispatch-dashboard')
  async getDispatchDashboard(
    @Query('fy') fy?: string,
    @Query('channel') channel?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('partner') partner?: string,
    @Query('aging') aging?: string,
  ) {
    return this.dispatchDashboardService.getDashboard({ fy: fy ? Number(fy) : undefined, channel, month, status, partner, aging });
  }

  @Get('dispatch-dashboard/list')
  async getDispatchDashboardList(
    @Query('kpi') kpi: string,
    @Query('fy') fy?: string,
    @Query('channel') channel?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('partner') partner?: string,
    @Query('aging') aging?: string,
  ) {
    if (!DISPATCH_KPIS.includes(kpi as DispatchKpi)) throw new BadRequestException(`kpi must be one of: ${DISPATCH_KPIS.join(', ')}`);
    return this.dispatchDashboardService.getKpiList({ fy: fy ? Number(fy) : undefined, channel, month, status, partner, aging }, kpi as DispatchKpi);
  }

  @Get('dispatch-dashboard/list.xlsx')
  async downloadDispatchDashboardList(
    @Query('kpi') kpi: string,
    @Res() res: Response,
    @Query('fy') fy?: string,
    @Query('channel') channel?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('partner') partner?: string,
    @Query('aging') aging?: string,
  ) {
    if (!DISPATCH_KPIS.includes(kpi as DispatchKpi)) throw new BadRequestException(`kpi must be one of: ${DISPATCH_KPIS.join(', ')}`);
    const buffer = await this.dispatchDashboardService.buildKpiListWorkbook(
      { fy: fy ? Number(fy) : undefined, channel, month, status, partner, aging },
      kpi as DispatchKpi,
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dispatch-dashboard-${kpi}.xlsx"`);
    res.send(buffer);
  }

  @Get('filter-options')
  async getFilterOptions() {
    return this.poService.getFilterOptions();
  }

  @Get('dashboard/metrics')
  async getDashboardMetrics() {
    return this.poService.getDashboardMetrics();
  }

  @Get('inventory/summary')
  async getInventoryRollup() {
    return this.poService.getInventoryRollup();
  }

  @Get('logistics/list')
  async listLogisticsTrackers() {
    return this.poService.listLogisticsTrackers();
  }

  @Get('dispatch/ready')
  async listReadyToDispatch() {
    return this.poService.listReadyToDispatch();
  }

  @Get('bin')
  async getBin() {
    return this.poService.getBin();
  }

  @Post('bulk-delete')
  async bulkSoftDeletePO(@Body() body: { poIds: string[] }, @Request() req: any) {
    if (!body?.poIds || body.poIds.length === 0) {
      throw new BadRequestException('poIds is required');
    }
    return this.poService.bulkSoftDeletePO(body.poIds, req.user.userId);
  }

  @Post('bulk-restore')
  async bulkRestorePO(@Body() body: { poIds: string[] }) {
    if (!body?.poIds || body.poIds.length === 0) {
      throw new BadRequestException('poIds is required');
    }
    return this.poService.bulkRestorePO(body.poIds);
  }

  @Post('bulk-permanent-delete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SCM)
  async bulkPermanentlyDeletePO(@Body() body: { poIds: string[]; reason?: string }, @Request() req: any) {
    if (!body?.poIds || body.poIds.length === 0) {
      throw new BadRequestException('poIds is required');
    }
    return this.poService.bulkPermanentlyDeletePO(body.poIds, req.user.userId, body.reason);
  }

  @Get('not-fulfilled/dashboard')
  async getNotFulfilledDashboard() {
    return this.poService.getNotFulfilledDashboard();
  }

  @Get(':poId')
  async getPOById(@Param('poId') poId: string) {
    return this.poService.getPOById(poId);
  }

  @Get(':poId/pdf')
  async downloadPdf(@Param('poId') poId: string, @Res() res: Response) {
    const po = await this.poService.getPOById(poId);
    const buffer = await this.poPdfService.generate(poId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${po.poNumber}.pdf"`);
    res.send(buffer);
  }

  @Delete(':poId')
  async softDeletePO(@Param('poId') poId: string, @Request() req: any) {
    return this.poService.softDeletePO(poId, req.user.userId);
  }

  @Post(':poId/restore')
  async restorePO(@Param('poId') poId: string) {
    return this.poService.restorePO(poId);
  }

  @Delete(':poId/permanent')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SCM)
  async permanentlyDeletePO(
    @Param('poId') poId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    await this.poService.permanentlyDeletePO(poId, req.user.userId, body?.reason);
    return { success: true };
  }

  @Get(':poId/non-fulfilment-diagnosis')
  async getNonFulfilmentDiagnosis(@Param('poId') poId: string) {
    return { diagnosis: await this.poService.getNonFulfilmentDiagnosis(poId) };
  }

  @Post(':poId/mark-not-fulfilled')
  async markNotFulfilled(
    @Param('poId') poId: string,
    @Body() body: { reason: NonFulfilmentReason; remarks?: string },
    @Request() req: any,
  ) {
    if (!body.reason) {
      throw new BadRequestException('reason is required');
    }
    return this.poService.markNotFulfilled(poId, req.user.userId, body.reason, body.remarks);
  }

  @Post(':poId/mark-fulfilled')
  async markFulfilled(@Param('poId') poId: string, @Request() req: any) {
    return this.poService.markFulfilled(poId, req.user.userId);
  }

  @Patch(':poId')
  async editPO(
    @Param('poId') poId: string,
    @Body() body: EditPORequest,
    @Request() req: any,
  ) {
    return this.poService.editPO(poId, body, req.user.userId);
  }

  @Get(':poId/line-items')
  async getLineItems(@Param('poId') poId: string) {
    return this.poService.getPOLineItems(poId);
  }

  @Get(':poId/timeline')
  async getTimeline(@Param('poId') poId: string) {
    return this.poService.getPOTimeline(poId);
  }

  @Get(':poId/change-history')
  async getChangeHistory(@Param('poId') poId: string) {
    return this.poService.getChangeHistory(poId);
  }

  @Get(':poId/source')
  async getSource(@Param('poId') poId: string) {
    return this.poService.getSourceTraceability(poId);
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
    if (!body.grnNumber || body.grnValue === undefined || body.grnValue === null || !body.outcome) {
      throw new BadRequestException('grnNumber, grnValue, and outcome are required');
    }
    return this.poService.recordGRN(poId, body);
  }

  @Post(':poId/reattempt')
  async reattemptDelivery(@Param('poId') poId: string, @Request() req: any) {
    return this.poService.reattemptDelivery(poId, req.user.userId);
  }
}
