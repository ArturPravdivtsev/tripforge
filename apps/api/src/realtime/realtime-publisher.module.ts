import { Module } from "@nestjs/common";

import { TripRealtimePublisher } from "./trip-realtime.publisher";

@Module({
  providers: [TripRealtimePublisher],
  exports: [TripRealtimePublisher],
})
export class RealtimePublisherModule {}
