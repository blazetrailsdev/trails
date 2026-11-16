import { Trailtie } from "../../lib/trailtie.js";
import type { Application } from "../../lib/application.js";
import { Configuration } from "../../lib/application/configuration.js";
import { Trails } from "../../lib/trails.js";

export async function runTrailtieInitializers(
  klass: typeof Trailtie,
  ...args: unknown[]
): Promise<void> {
  const app = args[0] as { config?: unknown } | undefined;
  const current = Trails.application as { config?: { databaseConfiguration?: unknown } } | null;
  if (app?.config instanceof Configuration && current?.config?.databaseConfiguration == null) {
    Trails.application = app as Application;
  }
  const context = klass.instance();
  for (const initializer of klass.initializers) {
    await initializer.bind(context).run(...args);
  }
}
