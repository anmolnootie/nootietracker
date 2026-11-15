import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@po-control-tower/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { ControlTowerService, RegisterFilter } from './control-tower.service';
import { FLAGS, GAPS, ISSUE_STATUS, ISSUE_TYPES, JSTEPS, PLATS, PRIORITIES, REASONS, DECISIONS, STAGES } from './control-tower.core';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Who may write Control Tower data (team fields, issues). The artifact had one
 * PIN-holding editor and view-only everyone else; here that maps to the
 * existing roles - everyone signed in can view, these roles can edit.
 */
export const CT_EDITOR_ROLES = [UserRole.ADMIN, UserRole.SCM, UserRole.OPS_EXECUTIVE];

function filterFrom(q: Record<string, string | undefined>): RegisterFilter {
  for (const k of ['from', 'to'] as const) {
    if (q[k] && !ISO.test(q[k]!)) throw new BadRequestException(`${k} must be YYYY-MM-DD`);
  }
  return {
    from: q.from || undefined,
    to: q.to || undefined,
    platform: q.platform || undefined,
    gap: q.gap || undefined,
    stage: q.stage ? Number(q.stage) : undefined,
    flag: q.flag ? Number(q.flag) : undefined,
    q: q.q || undefined,
    openOnly: q.open === '1' || q.open === 'true',
  };
}

/**
 * Control Tower read API. Period rule (artifact v3.js inP): with from/to, a PO
 * counts when its PO date (or first dispatch date, if undated) is in range and
 * undated POs are excluded; with neither, everything counts.
 */
@Controller('control-tower')
@UseGuards(AuthGuard('jwt'))
export class ControlTowerController {
  constructor(private readonly service: ControlTowerService) {}

  @Get('meta')
  meta() {
    return { platforms: PLATS, stages: STAGES, flags: FLAGS.filter(Boolean), steps: JSTEPS, gaps: GAPS, decisions: DECISIONS, reasons: REASONS, issueTypes: ISSUE_TYPES, issueStatus: ISSUE_STATUS, priorities: PRIORITIES, editorRoles: CT_EDITOR_ROLES };
  }

  @Get('summary')
  summary(@Query() q: Record<string, string>) {
    return this.service.summary(filterFrom(q));
  }

  @Get('journey')
  journey(@Query() q: Record<string, string>) {
    return this.service.journey(filterFrom(q));
  }

  @Get('trends')
  trends(@Query() q: Record<string, string>) {
    return this.service.trends(filterFrom(q));
  }

  @Get('register')
  register(@Query() q: Record<string, string>) {
    return this.service.register(filterFrom(q));
  }

  @Get('po/:poNumber')
  po(@Param('poNumber') poNumber: string) {
    return this.service.po(poNumber);
  }

  @Get('po/:poNumber/tracking')
  getTracking(@Param('poNumber') poNumber: string) {
    return this.service.getTracking(poNumber);
  }

  @Patch('po/:poNumber/tracking')
  @UseGuards(RolesGuard)
  @Roles(...CT_EDITOR_ROLES)
  updateTracking(@Param('poNumber') poNumber: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.service.updateTracking(poNumber, body, req.user.userId);
  }

  /** Batch handover / acknowledgement: { mode: 'handed' | 'ack', date, person, poNumbers: string[] | "pasted text" }. */
  @Post('handover')
  @UseGuards(RolesGuard)
  @Roles(...CT_EDITOR_ROLES)
  handover(@Body() body: Record<string, any>, @Req() req: any) {
    return this.service.batchHandover(body, req.user.userId);
  }
}
