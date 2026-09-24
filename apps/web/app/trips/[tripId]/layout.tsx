import type { ReactNode } from "react";

import { TripRealtimeBridge } from "@/components/realtime/trip-realtime-bridge";

type TripLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}>;

export default async function TripLayout({ children, params }: TripLayoutProps) {
  const { tripId } = await params;

  return <TripRealtimeBridge tripId={tripId}>{children}</TripRealtimeBridge>;
}
