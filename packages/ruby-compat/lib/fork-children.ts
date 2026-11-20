import type { WaitStatus } from "./child-process-adapter.js";
import { Errno } from "./errno.js";

/**
 * The children `rb_waitpid` (`vendor/ruby/v3.3.11/process.c:1269`) can still wait for.
 *
 * @noRailsEquivalent PERMANENT
 */
export const children = new Set<number>();
/**
 * The children that exited and `rb_waitpid` (`vendor/ruby/v3.3.11/process.c:1269`) has
 * not reaped yet.
 *
 * @noRailsEquivalent PERMANENT
 */
export const terminated: WaitStatus[] = [];

/**
 * `waitpid(-1, WNOHANG)` (`rb_waitpid`, `vendor/ruby/v3.3.11/process.c:1269`):
 * the next child that exited, `null` while every child is still running, and
 * `Errno::ECHILD` with no child left.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_waitpid`.
 */
export function rbWaitpidNohang(): WaitStatus | null {
  const status = terminated.shift();
  if (status !== undefined) {
    children.delete(status.pid!);
    return status;
  }
  if (children.size === 0) throw new Errno.ECHILD();
  return null;
}
