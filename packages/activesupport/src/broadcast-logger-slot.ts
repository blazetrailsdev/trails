/**
 * Zero-import slot for {@link BroadcastLogger}.
 *
 * Ruby resolves the `BroadcastLogger` constant named inside
 * `Logger.logger_outputs_to?` (`logger.rb:20`) when the method *runs*, so
 * `logger.rb` takes no load-order dependency on `broadcast_logger.rb`. ESM has
 * no equivalent: an `import` there would close a cycle
 * (`broadcast-logger.ts` → `logger.ts`) whose participants include
 * `class BroadcastLogger extends Logger`, and entering the graph at
 * `logger.ts` would evaluate the subclass with `Logger` still in TDZ.
 *
 * This module has no runtime imports, so it cannot join that cycle.
 * `broadcast-logger.ts` calls {@link _setBroadcastLoggerClass} at the bottom of
 * its own body; readers use the binding at call time.
 */

export let BroadcastLoggerClass: (new (...args: any[]) => { broadcasts: any[] }) | null = null;

export function _setBroadcastLoggerClass(klass: new (...args: any[]) => any): void {
  BroadcastLoggerClass = klass;
}
