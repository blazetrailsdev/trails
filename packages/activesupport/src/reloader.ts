/**
 * Port of `ActiveSupport::Reloader` from
 * `activesupport/lib/active_support/reloader.rb`.
 *
 * Only the `:prepare` callback surface is ported — `to_prepare` /
 * `prepare!` (reloader.rb:34-36, :95-97) are what `Rails::Application`'s
 * finisher initializers drive. The `:class_unload` callbacks, `wrap`, `run!`,
 * `complete!`, `check!`, `reload!` and the interlock locking are still
 * unported; `ActiveSupport::ExecutionWrapper` now is, so extending it is
 * tracked by `converge-reloader-onto-execution-wrapper`.
 */
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";

export type PrepareCallback = () => void;

export class Reloader {
  static {
    defineCallbacks(this.prototype, "prepare");
  }

  /** Rails: `def self.to_prepare(*args, &block)` (reloader.rb:34). */
  static toPrepare(block: PrepareCallback): void {
    setCallback(this.prototype, "prepare", "before", block);
  }

  /** Rails: `def self.prepare!` (reloader.rb:95) — `new.run_callbacks(:prepare)`. */
  static prepareBang(): void {
    runCallbacks(new this(), "prepare", () => undefined);
  }
}
