import { getPathAsync } from "@blazetrails/activesupport";
import { APP_PATH, ENGINE_PATH } from "../app-path.js";
import { Trails } from "../rails.js";

/**
 * Mirrors `Rails::Command::Actions#require_application!`
 * (`railties/lib/rails/command/actions.rb:13-16`). Rails names two
 * constants and requires each at most once; the path is decided by the
 * entry point (`bin/rails` defines `APP_PATH`), never discovered here.
 * `defined?(X)` reads as `X != null` over the bindings in `app-path.ts`.
 */
export async function requireApplicationBang(): Promise<void> {
  const p = await getPathAsync();
  if (!p.pathToFileURL) {
    throw new Error("PathAdapter.pathToFileURL() is required to boot an application.");
  }
  if (ENGINE_PATH != null) await import(p.pathToFileURL(ENGINE_PATH).href);
  if (APP_PATH != null) await import(p.pathToFileURL(APP_PATH).href);
}

/**
 * Mirrors `Rails::Command::Actions#boot_application!`
 * (`railties/lib/rails/command/actions.rb:18-21`) — `require_application!`
 * then `Rails.application.require_environment!`, which in trails is the
 * awaited `Trails.initialize()` that runs the initializers.
 */
export async function bootApplicationBang(): Promise<void> {
  await requireApplicationBang();
  if (APP_PATH != null) await Trails.initialize();
}
