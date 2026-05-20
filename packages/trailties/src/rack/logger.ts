/**
 * Rails::Rack::Logger — Rack middleware that sets log tags, logs the
 * request, calls the app, and finalizes instrumentation when the body
 * closes.
 *
 * Port of `railties/lib/rails/rack/logger.rb`.
 */

import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { BodyProxy } from "@blazetrails/rack";
import { Notifications } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

export type Tagger = string | ((env: RackEnv) => string);

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
    const tagCount = this.logger.pushTags
      ? this.logger.pushTags(...this.computeTags(env)).length
      : 0;
    env["rails.rackLoggerTagCount"] = tagCount;

    const startedAt = Date.now();
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      Notifications.publish("request.action_dispatch", {
        request: env,
        elapsed: Date.now() - startedAt,
      });
      if (this.logger.popTags && tagCount > 0) this.logger.popTags(tagCount);
    };

    try {
      this.logger.info?.(this.startedRequestMessage(env));
      const response = await this.app(env);
      const [status, headers, body] = response;
      const wrapped = new BodyProxy(body as AsyncIterable<unknown>, finish);
      if (Object.isFrozen(response)) {
        return [status, headers, wrapped] as RackResponse;
      }
      (response as unknown as [number, Record<string, string>, unknown])[2] = wrapped;
      return response;
    } catch (err) {
      finish();
      throw err;
    }
  }

  private startedRequestMessage(env: RackEnv): string {
    const method = env["REQUEST_METHOD"] ?? "GET";
    const path = env["PATH_INFO"] ?? "/";
    const remote = env["REMOTE_ADDR"] ?? "-";
    return `Started ${String(method)} "${String(path)}" for ${String(remote)} at ${Temporal.Now.instant().toString()}`;
  }

  private computeTags(env: RackEnv): string[] {
    return this.taggers.map((t) => (typeof t === "function" ? t(env) : t));
  }
}
