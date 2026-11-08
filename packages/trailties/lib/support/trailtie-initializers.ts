import { Trailtie } from "../trailtie.js";

export async function runTrailtieInitializers(
  klass: typeof Trailtie,
  ...args: unknown[]
): Promise<void> {
  const context = klass.instance();
  for (const initializer of klass.initializers) {
    await initializer.bind(context).run(...args);
  }
}
