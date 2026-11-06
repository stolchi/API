import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user.js';
import {
  CurrentCafe,
  CurrentUser,
  RequireAny,
} from '../common/auth/decorators.js';
import { Permission } from '../common/permissions.js';
import {
  CreateStaffMemberDto,
  CreateStaffRoleDto,
  StaffMemberDto,
  StaffRoleDto,
  UpdateStaffMemberDto,
  UpdateStaffRoleDto,
} from './staff.dto.js';
import { StaffService } from './staff.service.js';

@ApiTags('staff')
@ApiBearerAuth()
@RequireAny(Permission.STAFF_MANAGE)
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  // Declared before ':id' so that the path is not read as an id.
  @Get('roles')
  @ApiOkResponse({ type: [StaffRoleDto] })
  listRoles(@CurrentCafe() cafeId: string): Promise<StaffRoleDto[]> {
    return this.staff.listRoles(cafeId);
  }

  @Post('roles')
  @ApiCreatedResponse({ type: StaffRoleDto })
  createRole(
    @CurrentUser() user: AuthUser,
    @CurrentCafe() cafeId: string,
    @Body() dto: CreateStaffRoleDto,
  ): Promise<StaffRoleDto> {
    return this.staff.createRole(user, cafeId, dto);
  }

  @Patch('roles/:id')
  @ApiOkResponse({ type: StaffRoleDto })
  updateRole(
    @CurrentUser() user: AuthUser,
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffRoleDto,
  ): Promise<StaffRoleDto> {
    return this.staff.updateRole(user, cafeId, id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeRole(
    @CurrentUser() user: AuthUser,
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.staff.removeRole(user, cafeId, id);
  }

  @Get()
  @ApiOkResponse({ type: [StaffMemberDto] })
  list(@CurrentCafe() cafeId: string): Promise<StaffMemberDto[]> {
    return this.staff.listMembers(cafeId);
  }

  @Post()
  @ApiCreatedResponse({ type: StaffMemberDto })
  create(
    @CurrentUser() user: AuthUser,
    @CurrentCafe() cafeId: string,
    @Body() dto: CreateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    return this.staff.createMember(user, cafeId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StaffMemberDto })
  update(
    @CurrentUser() user: AuthUser,
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    return this.staff.updateMember(user, cafeId, id, dto);
  }
}
