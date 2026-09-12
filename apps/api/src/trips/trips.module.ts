import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TripsController } from "./trips.controller";
import { TripsRepository } from "./trips.repository";
import { TripsService } from "./trips.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TripsController],
  providers: [TripsRepository, TripsService],
})
export class TripsModule {}
