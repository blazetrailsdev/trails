import { rbModConstSet } from "./include.js";
import { RuntimeError } from "./runtime-error.js";

/**
 * Ruby's `Timeout` module (`vendor/ruby/v3.3.11/lib/timeout.rb:25`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Timeout = { name: "Timeout", timeout } as {
  readonly name: string;
  Error: typeof TimeoutError;
  timeout: typeof timeout;
};

/**
 * `Timeout.timeout` (`vendor/ruby/v3.3.11/lib/timeout.rb:169`). Ruby raises
 * into the thread running the block; a JS body cannot be interrupted, so the
 * block is raced against the timer and left to settle unobserved.
 *
 * @noRailsEquivalent PERMANENT
 */
async function timeout<R>(
  sec: number | null,
  klass: (new (message: string) => Error) | null = null,
  message: string | null = null,
  block: (sec: number | null) => R | Promise<R>,
): Promise<R> {
  if (sec == null || sec === 0) return block(sec);

  message ??= "execution expired";

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new (klass ?? TimeoutError)(message)), sec * 1000);
  });
  try {
    return await Promise.race([block(sec), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ruby's `Timeout::Error` (`vendor/ruby/v3.3.11/lib/timeout.rb:36`), a
 * `RuntimeError`.
 *
 * @noRailsEquivalent PERMANENT
 */
class TimeoutError extends RuntimeError {}

TimeoutError.prototype.name = "Timeout::Error";

rbModConstSet(Timeout, "Error", TimeoutError);
