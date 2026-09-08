import { Controller, Get, Post, Put, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PendingLocationStatus } from '@po-control-tower/shared';
import { LocationsService, ApprovePendingLocationInput } from './locations.service';

@Controller('locations')
@UseGuards(AuthGuard('jwt'))
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  list() {
    return this.locationsService.list();
  }

  @Post()
  create(@Body() body: any) {
    return this.locationsService.create(body);
  }

  @Get('pending')
  listPending(@Query('status') status?: PendingLocationStatus) {
    return this.locationsService.listPendingLocations(status);
  }

  @Post('pending/:id/approve')
  approvePending(@Param('id') id: string, @Body() body: ApprovePendingLocationInput, @Request() req: any) {
    return this.locationsService.approvePendingLocation(id, req.user.userId, body);
  }

  @Post('pending/:id/reject')
  rejectPending(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.rejectPendingLocation(id, req.user.userId);
  }

  @Post('pending/reconcile-exceptions')
  reconcileApprovedLocationExceptions() {
    return this.locationsService.reconcileApprovedLocationExceptions();
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.locationsService.update(id, body);
  }
}
