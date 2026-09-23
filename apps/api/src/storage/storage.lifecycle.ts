import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { S3Client } from "@aws-sdk/client-s3";

import { S3_INTERNAL_CLIENT, S3_SIGNING_CLIENT } from "./storage.constants";

@Injectable()
export class StorageLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(S3_INTERNAL_CLIENT) private readonly internalClient: S3Client,
    @Inject(S3_SIGNING_CLIENT) private readonly signingClient: S3Client,
  ) {}

  onApplicationShutdown(): void {
    this.internalClient.destroy();
    this.signingClient.destroy();
  }
}
