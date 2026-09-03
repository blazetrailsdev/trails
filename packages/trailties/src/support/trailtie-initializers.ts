import { Trailtie } from "../trailtie.js";

/**
 * Run the initializers a single railtie registers, bound to its instance and
 * yielded `args` — the slice of `Initializable#run_initializers`
 * (`railties/lib/rails/initializable.rb:60-63`) a per-railtie test needs,
 * without the `@ran` memo an `Application` boot relies on.
 *
 * Test support only; not part of any package's public surface.
 */
export async function runTrailtieInitializers(
  klass: typeof Trailtie,
  ...args: unknown[]
): Promise<void> {
  const context = klass.instance();
  for (const initializer of klass.initializers) {
    await initializer.bind(context).run(...args);
  }
}
