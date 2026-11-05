import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './common/auth/decorators.js';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly app: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Checks that the API and its database are up' })
  health(): Promise<{ status: 'ok' }> {
    return this.app.health();
  }
}
