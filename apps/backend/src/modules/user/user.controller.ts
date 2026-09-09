import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRole } from '@po-control-tower/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

/** Every response leaving this controller goes through this - the password hash never should. */
function sanitize(user: UserEntity) {
  const { password, ...safe } = user;
  return safe;
}

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async findAll() {
    return (await this.userService.findAll()).map(sanitize);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return sanitize(await this.userService.findById(id));
  }

  /** Only admins create accounts - there's no public self-registration in this app. */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(@Body() body: { email: string; password: string; name: string; roles?: UserRole[] }) {
    if (!body.email || !body.password || !body.name) {
      throw new BadRequestException('email, password, and name are required');
    }
    return sanitize(await this.userService.create(body));
  }

  @Put(':id/roles')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateRoles(
    @Param('id') id: string,
    @Body() body: { roles: UserRole[] },
  ) {
    return sanitize(await this.userService.updateRoles(id, body.roles));
  }

  @Put(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async deactivate(@Param('id') id: string) {
    return sanitize(await this.userService.deactivate(id));
  }

  @Put(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async activate(@Param('id') id: string) {
    return sanitize(await this.userService.activate(id));
  }
}
