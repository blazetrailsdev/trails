import type { RackHeaders } from "./index.js";
import { rbFSend } from "@blazetrails/ruby-compat";
import type { RackApp } from "./mock-request.js";
import { BodyProxy } from "./body-proxy.js";

interface Mutex {
  lock(): void;
  unlock(): void;
}

class DefaultMutex implements Mutex {
  synchronized = false;
  lock() {
    this.synchronized = true;
  }
  unlock() {
    this.synchronized = false;
  }
}

export class Lock {
  private app: RackApp;
  private mutex: Mutex;

  constructor(app: RackApp, mutex?: Mutex) {
    this.app = app;
    this.mutex = mutex || new DefaultMutex();
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    this.mutex.lock();
    let returned: [number, RackHeaders, any] | undefined;
    try {
      const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
      response.push(new BodyProxy(response.pop(), () => this.unlock()));
      returned = response;
      return returned;
    } finally {
      if (!returned) this.unlock();
    }
  }

  /** @internal */
  private unlock(): void {
    this.mutex.unlock();
  }
}
