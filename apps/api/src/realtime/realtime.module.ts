import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { TripsModule } from "../trips/trips.module";
import { RealtimePublisherModule } from "./realtime-publisher.module";
import { TripRealtimeGateway } from "./trip-realtime.gateway";

@Module({
  imports: [AuthModule, RealtimePublisherModule, TripsModule],
  providers: [TripRealtimeGateway],
})
export class RealtimeModule {}
