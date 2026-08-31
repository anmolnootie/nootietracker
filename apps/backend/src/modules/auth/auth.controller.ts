import { Controller, Post, Body, HttpCode, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequest, LoginResponse } from '@po-control-tower/shared';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginRequest): Promise<LoginResponse> {
    return this.authService.login(loginDto);
  }

  @Post('register')
  async register(
    @Body() body: { email: string; password: string; name: string },
  ) {
    if (!body.email || !body.password || !body.name) {
      throw new BadRequestException('Missing required fields');
    }
    return this.authService.register(body.email, body.password, body.name);
  }
}
