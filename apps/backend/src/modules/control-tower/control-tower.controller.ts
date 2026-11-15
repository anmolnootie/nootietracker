import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ControlTowerService, RegisterFilter } from './control-tower.service';
import { FLAGS, GAPS, ISSUE_STATUS, ISSUE_TYPES, JSTEPS, PLATS, PRIORITIES, REASONS, DECISIONS, STAGES } from './control-tower.core';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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
    return { platforms: PLATS, stages: STAGES, flags: FLAGS.filter(Boolean), steps: JSTEPS, gaps: GAPS, decisions: DECISIONS, reasons: REASONS, issueTypes: ISSUE_TYPES, issueStatus: ISSUE_STATUS, priorities: PRIORITIES };
  }

  @Get('summary')
  summary(@Query() q: Record<string, string>) {
    return this.service.summary(filterFrom(q));
  }

  @Get('journey')
  journey(@Query() q: Record<string, string>) {
    return this.service.journey(filterFrom(q));
  }

  @Get('register')
  register(@Query() q: Record<string, string>) {
    return this.service.register(filterFrom(q));
  }

  @Get('po/:poNumber')
  po(@Param('poNumber') poNumber: string) {
    return this.service.po(poNumber);
  }
}
