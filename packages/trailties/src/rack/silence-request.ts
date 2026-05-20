/**
 * Rails::Rack::SilenceRequest — silences requests to a specific path
 * (e.g. `/up` health checks) so they don't clog the log.
 *
 * Port of `railties/lib/rails/rack/silence_request.rb`.
 */

import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Logger as ASLogger } from "@blazetrails/activesupport";

export interface Silencer {
  silence(level: number | string, fn: () => void): void;
  silenceAsync?<T>(level: number | string, fn: () => Promise<T>): Promise<T>;
}

// Rails' Rack::SilenceRequest calls `Rails.logger.silence { ... }` with no
// argument, which defaults to ActiveSupport::Logger::ERROR.
const ERROR_LEVEL = ASLogger.ERROR;

export interface SilenceRequestOptions {
  path: string;
  logger?: Silencer;
}

export class SilenceRequest {
  private app: RackApp;
  private path: string;
  private logger?: Silencer;

  constructor(app: RackApp, options: SilenceRequestOptions) {
    this.app = app;
    this.path = options.path;
    this.logger = options.logger;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (env["PATH_INFO"] === this.path && this.logger) {
      const logger = this.logger;
      if (logger.silenceAsync) {
        return logger.silenceAsync(ERROR_LEVEL, () => this.app(env));
      }
      let pending: Promise<RackResponse> | undefined;
      logger.silence(ERROR_LEVEL, () => {
        pending = this.app(env);
      });
      if (!pending) {
        throw new Error(
          "Silencer.silence did not invoke callback synchronously; provide silenceAsync for async-aware silencing.",
        );
      }
      return pending;
    }
    return this.app(env);
  }
}
