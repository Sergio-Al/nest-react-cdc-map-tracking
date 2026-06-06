import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, SignupDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // Self-serve signup: public, rate-limited (5/min per IP) to deter abuse.
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  // Live workspace-id availability for the signup form (30/min per IP).
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('workspace-available')
  async workspaceAvailable(@Query('id') id: string) {
    return this.authService.checkWorkspace(id);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refreshTokens(refreshDto.refreshToken);
  }

  @Roles('admin')
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('logout')
  async logout(@CurrentUser() user: any, @Body() body: { refreshToken: string }) {
    return this.authService.logout(user.userId, body.refreshToken);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getUserById(user.userId);
  }
}
