import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './common/auth/decorators.js';

class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly app: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Checks that the API and its database are up' })
  @ApiOkResponse({ type: HealthDto })
  health(): Promise<HealthDto> {
    return this.app.health();
  }
}
