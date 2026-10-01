import type { NodeSDK } from "@opentelemetry/sdk-node";

import type { TripForgeServiceName } from "./observability-config";

let serviceName: TripForgeServiceName = "tripforge-api";
let telemetrySdk: NodeSDK | undefined;

export function setRuntimeServiceName(value: TripForgeServiceName): void {
  serviceName = value;
}

export function getRuntimeServiceName(): TripForgeServiceName {
  return serviceName;
}

export function setTelemetrySdk(sdk: NodeSDK): void {
  telemetrySdk = sdk;
}

export function getTelemetrySdk(): NodeSDK | undefined {
  return telemetrySdk;
}
