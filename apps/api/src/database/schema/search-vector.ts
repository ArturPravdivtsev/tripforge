import { customType } from "drizzle-orm/pg-core";

export const searchVector = customType<{ data: string }>({
  dataType: () => "tsvector",
});
