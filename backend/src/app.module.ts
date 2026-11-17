import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { GroupsController } from './groups/groups.controller';
import { GroupsService } from './groups/groups.service';
import { CleaningController } from './cleaning/cleaning.controller';
import { CleaningService } from './cleaning/cleaning.service';
import { AuthGuard } from './auth/auth.guard';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [AuthController, GroupsController, CleaningController],
  providers: [PrismaService, AuthService, GroupsService, CleaningService, AuthGuard, EventsGateway],
})
export class AppModule {}
