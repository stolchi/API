import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_MS } from '../auth/auth.service.js';
import { Public } from '../common/auth/decorators.js';
import type { NetworkCourier } from '../database/entities/network-courier.entity.js';
import { NetworkAuthService } from './network-auth.service.js';
import {
  CurrentNetworkCourier,
  NetworkCourierGuard,
} from './network-courier.guard.js';
import {
  NetworkAuthResponseDto,
  NetworkCourierDto,
  NetworkLoginDto,
  NetworkRefreshResponseDto,
  NetworkRegisterDto,
} from './network.dto.js';

/** Its own cookie and path: a courier's session never touches a staff one. */
export const NETWORK_REFRESH_COOKIE = 'stolchi_courier_refresh';

@ApiTags('network')
@Public()
@Controller('network/auth')
export class NetworkAuthController {
  constructor(
    private readonly auth: NetworkAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @ApiCreatedResponse({ type: NetworkAuthResponseDto })
  async register(
    @Body() dto: NetworkRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<NetworkAuthResponseDto> {
    const { body, refreshToken } = await this.auth.register(dto);
    res.cookie(NETWORK_REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return body;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NetworkAuthResponseDto })
  async login(
    @Body() dto: NetworkLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<NetworkAuthResponseDto> {
    const { body, refreshToken } = await this.auth.login(dto);
    res.cookie(NETWORK_REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return body;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(NETWORK_REFRESH_COOKIE)
  @ApiOkResponse({ type: NetworkRefreshResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<NetworkRefreshResponseDto> {
    const { body, refreshToken } = await this.auth.refresh(this.cookieOf(req));
    res.cookie(NETWORK_REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return body;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookieOf(req));
    res.clearCookie(NETWORK_REFRESH_COOKIE, this.baseCookieOptions());
  }

  @Get('me')
  @UseGuards(NetworkCourierGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: NetworkCourierDto })
  me(@CurrentNetworkCourier() courier: NetworkCourier) {
    return this.auth.me(courier.id);
  }

  private cookieOf(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined>)[
      NETWORK_REFRESH_COOKIE
    ];
  }

  private cookieOptions(): CookieOptions {
    return { ...this.baseCookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS };
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/api/v1/network/auth',
    };
  }
}
