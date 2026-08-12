/**
 * Mirrors: ActiveSupport::Concurrency::LoadInterlockAwareMonitor
 * (`activesupport/lib/active_support/concurrency/load_interlock_aware_monitor.rb`).
 *
 * Rails' subclass of Ruby's `Monitor` exists for one reason: while a fiber is
 * BLOCKED waiting for the lock, `mon_enter` re-enters through
 * `ActiveSupport::Dependencies.interlock.permit_concurrent_loads`, so the
 * autoload interlock can still run a dependency load. ESM has no autoload and
 * no interlock to permit loads through, so the mixin's `mon_enter` override
 * reduces to the base monitor's — and its `Thread.handle_interrupt` framing has
 * no JS counterpart either (there are no asynchronous thread interrupts to
 * defer). What is left is exactly `MonitorMixin#synchronize`, which is what
 * this class exposes, under Rails' name and at Rails' path so
 * `@connection.lock` reads as it does in the Ruby.
 */
import { Monitor } from "./monitor.js";

export class LoadInterlockAwareMonitor extends Monitor {}
