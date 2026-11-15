import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@po-control-tower/shared';
import { RiskEngine } from '../../engines/risk.engine';
import { ConfigService } from './config.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('config')
@UseGuards(AuthGuard('jwt'))
export class ConfigController {
  constructor(
    private readonly riskEngine: RiskEngine,
    private readonly configService: ConfigService,
  ) {}

  @Get('thresholds')
  async getThresholds() {
    return {
      risk: await this.riskEngine.getThresholds(),
      sla: {
        appointmentRequestSLAHours: 12,
        appointmentRequestEscalationHours: 24,
        grnSLAHours: [24, 48, 72],
        avvFollowUpInitialDays: 3,
        avvFollowUpRepeatDays: 2,
        appointmentExtensionWindowDays: 4,
      },
    };
  }

  @Get('control-tower-sla')
  getControlTowerSla() {
    return this.configService.getControlTowerSla();
  }

  @Patch('control-tower-sla')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateControlTowerSla(@Body() body: Record<string, number>, @Req() req: any) {
    return this.configService.updateControlTowerSla(body, req.user.userId);
  }

  @Patch('thresholds/risk')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateRiskThresholds(
    @Body() body: { black?: number; red?: number; orange?: number; yellow?: number },
    @Req() req: any,
  ) {
    return this.configService.updateRiskThresholds(body, req.user.userId);
  }
}
