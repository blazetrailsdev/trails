import type { RackApp } from "./mock-request.js";

interface Mutex {
  lock(): void;
  unlock(): void;
}

class DefaultMutex implements Mutex {
  synchronized = false;
  lock() { this.synchronized = true; }
  unlock() { this.synchronized = false; }
}

export class Lock {
  private app: RackApp;
  private mutex: Mutex;

  constructor(app: RackApp, mutex?: Mutex) {
    this.app = app;
    this.mutex = mutex || new DefaultMutex();
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    this.mutex.lock();
    let response: [number, Record<string, string>, any];
    try {
      response = await this.app(env);
    } catch (e) {
      this.mutex.unlock();
      throw e;
    }

    const [status, headers, body] = response;
    const mutex = this.mutex;

    // Wrap body to unlock on close
    const proxy: any = {
      close() {
        if (body && typeof body.close === "function") body.close();
        mutex.unlock();
      },
    };

    // Delegate each if available
    if (body && typeof body.each === "function") {
      proxy.each = (fn: (x: string) => void) => body.each(fn);
    }
    if (Array.isArray(body)) {
      proxy[Symbol.iterator] = () => body[Symbol.iterator]();
      proxy.forEach = body.forEach.bind(body);
      proxy.length = body.length;
      for (let i = 0; i < body.length; i++) proxy[i] = body[i];
    }

    // Delegate to_path if body has it
    if (body && typeof body.toPath === "function") {
      proxy.toPath = () => body.toPath();
    }

    return [status, headers, proxy];
  }
}
