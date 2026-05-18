/**
 * ActionDispatch::ServerTiming
 *
 * Collects ActiveSupport::Notifications events fired during a request and
 * exposes their durations via the `Server-Timing` response header.
 */

import {
  Notifications,
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
  type NotificationSubscriber,
  type NotificationEvent as Event,
} from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { SERVER_TIMING } from "../constants.js";

/** @internal */
export class Subscriber {
  private static _instance: Subscriber | null = null;
  private _subscriber: NotificationSubscriber | null = null;
  private _context: AsyncContext<Event[]> | null = null;
  private _contextAdapter: AsyncContextAdapter | null = null;

  static instance(): Subscriber {
    return (this._instance ??= new Subscriber());
  }

  private _events(): AsyncContext<Event[]> {
    const adapter = getAsyncContext();
    if (!this._context || this._contextAdapter !== adapter) {
      this._contextAdapter = adapter;
      this._context = adapter.create<Event[]>();
    }
    return this._context;
  }

  call(event: Event): void {
    const events = this._events().getStore();
    if (events) events.push(event);
  }

  async collectEvents(block: () => Promise<void>): Promise<Event[]> {
    const events: Event[] = [];
    await this._events().run(events, block);
    return events;
  }

  ensureSubscribed(): void {
    this._subscriber ??= Notifications.subscribe(/^[^!]/, (e) => this.call(e));
  }

  unsubscribe(): void {
    if (this._subscriber) {
      Notifications.unsubscribe(this._subscriber);
      this._subscriber = null;
    }
  }
}

export class ServerTiming {
  static Subscriber = Subscriber;

  private app: RackApp;
  private subscriber: Subscriber;

  static unsubscribe(): void {
    Subscriber.instance().unsubscribe();
  }

  constructor(app: RackApp) {
    this.app = app;
    this.subscriber = Subscriber.instance();
    this.subscriber.ensureSubscribed();
  }

  async call(env: RackEnv): Promise<RackResponse> {
    let response: RackResponse | undefined;
    const events = await this.subscriber.collectEvents(async () => {
      response = await this.app(env);
    });

    const headers = response![1];

    const byName = new Map<string, number>();
    for (const event of events) {
      byName.set(event.name, (byName.get(event.name) ?? 0) + event.duration);
    }
    const headerInfo: string[] = [];
    for (const [name, duration] of byName) {
      headerInfo.push(`${name};dur=${duration.toFixed(2)}`);
    }

    const existing = headers[SERVER_TIMING];
    if (existing != null && existing.trim() !== "") {
      headerInfo.unshift(existing);
    }
    headers[SERVER_TIMING] = headerInfo.join(", ");

    return response!;
  }
}
