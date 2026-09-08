import { Module } from "@nestjs/common";

import { DATABASE } from "./database.constants";
import { DatabaseLifecycle } from "./database.lifecycle";
import { databaseProviders } from "./database.provider";

@Module({
  providers: [...databaseProviders, DatabaseLifecycle],
  exports: [DATABASE],
})
export class DatabaseModule {}
