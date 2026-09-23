import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

import { S3_INTERNAL_CLIENT, S3_SIGNING_CLIENT } from "./storage.constants";
import { S3StorageService } from "./s3-storage.service";
import { StorageLifecycle } from "./storage.lifecycle";

function clientConfig(
  config: ConfigService,
  endpointName: "S3_ENDPOINT" | "S3_PUBLIC_ENDPOINT",
): S3ClientConfig {
  const endpoint = config.get<string>(endpointName);
  return {
    endpoint,
    forcePathStyle: config.get<boolean>("S3_FORCE_PATH_STYLE", false),
    region: config.getOrThrow<string>("S3_REGION"),
  };
}

@Module({
  providers: [
    {
      provide: S3_INTERNAL_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3Client(clientConfig(config, "S3_ENDPOINT")),
    },
    {
      provide: S3_SIGNING_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const publicEndpoint = config.get<string>("S3_PUBLIC_ENDPOINT");
        const options = clientConfig(config, "S3_PUBLIC_ENDPOINT");
        if (!publicEndpoint) options.endpoint = config.get<string>("S3_ENDPOINT");
        return new S3Client(options);
      },
    },
    S3StorageService,
    StorageLifecycle,
  ],
  exports: [S3StorageService],
})
export class StorageModule {}
