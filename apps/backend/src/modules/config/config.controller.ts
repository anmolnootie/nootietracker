import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RiskEngine } from '../../engines/risk.engine';

@Controller('config')
@UseGuards(AuthGuard('jwt'))
export class ConfigController {
  constructor(private readonly riskEngine: RiskEngine) {}

  @Get('thresholds')
  getThresholds() {
    return {
      risk: this.riskEngine.getThresholds(),
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
}
