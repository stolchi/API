import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthUser } from '../common/auth/auth-user.js';
import { CurrentUser, Public } from '../common/auth/decorators.js';
import { AuthService, REFRESH_TOKEN_TTL_MS } from './auth.service.js';
import {
  AuthResponseDto,
  LoginDto,
  RefreshResponseDto,
  RegisterDto,
  UserDto,
} from './dto/auth.dto.js';

export const REFRESH_COOKIE = 'stolchi_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new cafe together with its owner' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { body, refreshToken } = await this.auth.register(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return body;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { body, refreshToken } = await this.auth.login(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: RefreshResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponseDto> {
    const { body, refreshToken } = await this.auth.refresh(this.cookieOf(req));
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return body;
  }

  // Public: the access token may already have expired when the user signs out.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookieOf(req));
    res.clearCookie(REFRESH_COOKIE, this.baseCookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }

  private cookieOf(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  }

  private cookieOptions(): CookieOptions {
    return { ...this.baseCookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS };
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/api/v1/auth',
    };
  }
}
