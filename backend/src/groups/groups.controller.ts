
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { GroupsService } from './groups.service';
import { ThrottlerGuard } from '@nestjs/throttler';

class GroupNameDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

class JoinDto {
  @IsString()
  @MinLength(8)
  @MaxLength(24)
  code: string;
}

@Controller('groups')
@UseGuards(AuthGuard, ThrottlerGuard)
export class GroupsController {
  constructor(private groups: GroupsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.groups.list((req as any).user.id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: GroupNameDto) {
    return this.groups.create(
      (req as any).user.id,
      dto.name,
    );
  }

  @Post('join')
  join(@Req() req: Request, @Body() dto: JoinDto) {
    return this.groups.join(
      (req as any).user.id,
      dto.code,
    );
  }

  @Post(':id/invite')
  invite(@Req() req: Request, @Param('id') id: string) {
    return this.groups.createInvite(
      id,
      (req as any).user.id,
    );
  }

  @Post(':id/invite/refresh')
  refreshInvite(@Req() req: Request, @Param('id') id: string) {
    return this.groups.refreshInvite(
      id,
      (req as any).user.id,
    );
  }

  @Post(':id/leave')
  leave(@Req() req: Request, @Param('id') id: string) {
    return this.groups.leave(
      id,
      (req as any).user.id,
    );
  }

  @Put(':id')
  rename(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: GroupNameDto,
  ) {
    return this.groups.rename(
      id,
      (req as any).user.id,
      dto.name,
    );
  }

  @Delete(':id/members/:userId')
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.groups.removeMember(
      id,
      (req as any).user.id,
      userId,
    );
  }
}
