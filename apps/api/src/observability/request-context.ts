import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = Readonly<{
  requestId: string;
}>;

class RequestContextStorage {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }
}

export const requestContext = new RequestContextStorage();
