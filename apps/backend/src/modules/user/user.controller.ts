import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { UserRole } from '@po-control-tower/shared';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Put(':id/roles')
  async updateRoles(
    @Param('id') id: string,
    @Body() body: { roles: UserRole[] },
  ) {
    return this.userService.updateRoles(id, body.roles);
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.userService.deactivate(id);
  }

  @Put(':id/activate')
  async activate(@Param('id') id: string) {
    return this.userService.activate(id);
  }
}
