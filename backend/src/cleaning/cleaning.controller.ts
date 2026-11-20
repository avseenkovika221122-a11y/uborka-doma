import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  Matches,
} from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CleaningService } from './cleaning.service';
import { ThrottlerGuard } from '@nestjs/throttler';

class TaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}

class AddCompletedTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  title: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  assigneeId?: string | null;
}

class CompleteDto {
  @IsBoolean()
  completed: boolean;
}

class CreateRecurringTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  alternateTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  startDate: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  assigneeIds: string[];
}

class UpdateRecurringTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(120)
  alternateTitle?: string | null;

  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Controller('groups/:groupId')
@UseGuards(AuthGuard, ThrottlerGuard)
export class CleaningController {
  constructor(private cleaning: CleaningService) {}

  @Get('tasks')
  list(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.cleaning.list(
      groupId,
      (req as any).user.id,
      from,
      to,
    );
  }

  @Post('tasks')
  create(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Body() dto: TaskDto,
  ) {
    return this.cleaning.create(
      groupId,
      (req as any).user.id,
      dto,
    );
  }

  @Post('tasks/quick-complete')
  addCompletedTask(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Body() dto: AddCompletedTaskDto,
  ) {
    return this.cleaning.addCompletedTask(
      groupId,
      (req as any).user.id,
      dto,
    );
  }

  @Put('tasks/:taskId')
  update(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.cleaning.update(
      groupId,
      taskId,
      (req as any).user.id,
      dto,
    );
  }

  @Post('tasks/:taskId/completion')
  complete(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteDto,
  ) {
    return this.cleaning.complete(
      groupId,
      taskId,
      (req as any).user.id,
      dto.completed,
    );
  }

  @Delete('tasks/:taskId')
  remove(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.cleaning.remove(
      groupId,
      taskId,
      (req as any).user.id,
    );
  }

  @Post('recurring-tasks')
  createRecurring(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Body() dto: CreateRecurringTaskDto,
  ) {
    return this.cleaning.createRecurring(
      groupId,
      (req as any).user.id,
      dto,
    );
  }

  @Get('recurring-tasks')
  listRecurring(
    @Req() req: Request,
    @Param('groupId') groupId: string,
  ) {
    return this.cleaning.listRecurring(
      groupId,
      (req as any).user.id,
    );
  }

  @Put('recurring-tasks/:recurringId')
  updateRecurring(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Param('recurringId') recurringId: string,
    @Body() dto: UpdateRecurringTaskDto,
  ) {
    return this.cleaning.updateRecurring(
      groupId,
      recurringId,
      (req as any).user.id,
      dto,
    );
  }

  @Delete('recurring-tasks/:recurringId')
  removeRecurring(
    @Req() req: Request,
    @Param('groupId') groupId: string,
    @Param('recurringId') recurringId: string,
  ) {
    return this.cleaning.removeRecurring(
      groupId,
      recurringId,
      (req as any).user.id,
    );
  }

  @Get('rating')
  rating(
    @Req() req: Request,
    @Param('groupId') groupId: string,
  ) {
    return this.cleaning.rating(
      groupId,
      (req as any).user.id,
    );
  }
}
