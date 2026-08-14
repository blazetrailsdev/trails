/**
 * Rails::Rack::Logger — Rack middleware that sets log tags, logs the
 * request, calls the app, and finalizes instrumentation when the body
 * closes.
 *
 * Port of `railties/lib/rails/rack/logger.rb`.
 */

import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { BodyProxy } from "@blazetrails/rack";
import { Request } from "@blazetrails/actionpack";
import { LogSubscriber, Notifications } from "@blazetrails/activesupport";
import type { NotificationHandle } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

/**
 * logger.rb:11-13 — "methods that the +request+ object responds to, objects
 * that respond to +to_s+ or Proc objects that accept an instance of the
 * +request+ object". A Ruby Symbol tagger is a `":name"` string here (the
 * leading colon is the discriminator Ruby gets from the type); any other
 * string is the literal tag.
 */
export type Tagger = string | ((request: Request) => string);

export interface RackLoggerLike {
  info?(msg: string): void;
  pushTags?(...tags: string[]): string[];
  popTags?(count?: number): string[];
}

export interface LoggerOptions {
  logger?: RackLoggerLike;
  taggers?: Tagger[];
}

const NOOP_LOGGER: RackLoggerLike = {};

export class Logger {
  private app: RackApp;
  private logger: RackLoggerLike;
  private taggers: Tagger[];

  constructor(app: RackApp, options: LoggerOptions = {}) {
    this.app = app;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.taggers = options.taggers ?? [];
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const request = new Request(env);

    const tagCount = this.logger.pushTags
      ? this.logger.pushTags(...this.computeTags(request)).length
      : 0;
    env["rails.rackLoggerTagCount"] = tagCount;

    return this.callApp(request, env);
  }

  private async callApp(request: Request, env: RackEnv): Promise<RackResponse> {
    const loggerTagPopCount = env["rails.rackLoggerTagCount"] as number;

    const instrumenter = Notifications.instrumenter;
    const handle = instrumenter.buildHandle("request.action_dispatch", { request });
    handle.start();

    try {
      this.logger.info?.(this.startedRequestMessage(request));
      const response = await this.app.call(this.app, env);
      const [status, headers, body] = response;
      const wrapped = new BodyProxy(body as AsyncIterable<unknown>, () =>
        this.finishRequestInstrumentation(handle, loggerTagPopCount),
      );
      if (Object.isFrozen(response)) {
        return [status, headers, wrapped] as RackResponse;
      }
      (response as unknown as [number, Record<string, string>, unknown])[2] = wrapped;
      return response;
    } catch (err) {
      this.finishRequestInstrumentation(handle, loggerTagPopCount);
      throw err;
    }
  }

  // Started GET "/session/new" for 127.0.0.1 at 2012-09-26 14:51:42 -0700
  private startedRequestMessage(request: Request): string {
    return `Started ${request.rawRequestMethod} "${request.filteredPath()}" for ${request.remoteIp ?? "-"} at ${Temporal.Now.instant().toString()}`;
  }

  private computeTags(request: Request): string[] {
    return this.taggers.map((tag) => {
      if (typeof tag === "function") return tag(request);
      if (tag.startsWith(":")) {
        const name = tag.slice(1);
        const value = (request as unknown as Record<string, unknown>)[name];
        return String(typeof value === "function" ? value.call(request) : value);
      }
      return tag;
    });
  }

  private finishRequestInstrumentation(
    handle: NotificationHandle,
    loggerTagPopCount: number,
  ): void {
    handle.finish();
    if (this.logger.popTags && loggerTagPopCount > 0) this.logger.popTags(loggerTagPopCount);
    LogSubscriber.flushAllBang();
  }
}
