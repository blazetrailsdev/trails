import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { Trails } from "../rails.js";

/**
 * Rails' `require APP_PATH`. Trails apps ship TypeScript sources and a
 * compiled `dist/`, so both spellings of `config/application` are probed —
 * the built one first, mirroring how `bin/rails` prefers the loaded app,
 * then the TypeScript source at the Rails layout's `config/application.ts`.
 *
 * Mirrors `Rails::Command::Actions#require_application!`
 * (`railties/lib/rails/command/actions.rb:13-16`).
 */
export async function requireApplicationBang(root: string): Promise<void> {
  const fs = await getFsAsync();
  const p = await getPathAsync();
  if (!p.pathToFileURL) {
    throw new Error("PathAdapter.pathToFileURL() is required to boot an application.");
  }
  for (const candidate of [
    p.join(root, "dist", "config", "application.js"),
    p.join(root, "config", "application.ts"),
  ]) {
    if (await fs.exists(candidate)) {
      await import(p.pathToFileURL(candidate).href);
      return;
    }
  }
  throw new Error(`No config/application.ts found in ${root}.`);
}

/**
 * Mirrors `Rails::Command::Actions#boot_application!`
 * (`railties/lib/rails/command/actions.rb:18-21`) — `require_application!`
 * then `Rails.application.require_environment!`, which in trails is the
 * awaited `Trails.initialize()` that runs the initializers.
 *
 * @missingRailsArgs require_application! — PERMANENT
 */
export async function bootApplicationBang(root: string): Promise<void> {
  await requireApplicationBang(root);
  await Trails.initialize();
}
