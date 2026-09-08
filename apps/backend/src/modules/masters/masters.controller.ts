import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MastersService } from './masters.service';

@Controller('masters')
@UseGuards(AuthGuard('jwt'))
export class MastersController {
  constructor(private readonly mastersService: MastersService) {}

  @Get('customers')
  listCustomers() {
    return this.mastersService.listCustomers();
  }

  @Post('customers')
  createCustomer(@Body() body: any) {
    return this.mastersService.createCustomer(body);
  }

  @Get('transporters')
  listTransporters() {
    return this.mastersService.listTransporters();
  }

  @Post('transporters')
  createTransporter(@Body() body: any) {
    return this.mastersService.createTransporter(body);
  }

  @Get('owners')
  listOwners() {
    return this.mastersService.listOwners();
  }

  @Post('owners')
  createOwner(@Body() body: any) {
    return this.mastersService.createOwner(body);
  }
}
