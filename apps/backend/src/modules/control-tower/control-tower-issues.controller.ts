import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CT_EDITOR_ROLES } from './control-tower.controller';
import { ControlTowerIssuesService } from './control-tower-issues.service';

/** Issues CRM + audit trail. Anyone signed in can read; CT_EDITOR_ROLES can write. */
@Controller('control-tower')
@UseGuards(AuthGuard('jwt'))
export class ControlTowerIssuesController {
  constructor(private readonly issues: ControlTowerIssuesService) {}

  @Get('issues')
  list(@Query() q: Record<string, string>) {
    return this.issues.list({ status: q.status, open: q.open === '1' || q.open === 'true', poNumber: q.po, platform: q.platform, assignee: q.assignee });
  }

  @Post('issues')
  @UseGuards(RolesGuard)
  @Roles(...CT_EDITOR_ROLES)
  create(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.issues.create(body, req.user.userId);
  }

  @Patch('issues/:id')
  @UseGuards(RolesGuard)
  @Roles(...CT_EDITOR_ROLES)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.issues.update(id, body, req.user.userId);
  }

  @Get('audit')
  audit(@Query() q: Record<string, string>) {
    return this.issues.audit({ poNumber: q.po, limit: q.limit ? Number(q.limit) : undefined });
  }
}
