import { Dir } from "./dir.js";
import { File } from "./file.js";
import { LoadError } from "./load-error.js";

/**
 * `Bundler.require` (`vendor/ruby/v3.3.11/lib/bundler.rb:211`), whose
 * `Bundler::Runtime#require` (`vendor/ruby/v3.3.11/lib/bundler/runtime.rb:40`) is the
 * call a generated `config/application.ts` makes where `application.rb.tt` calls
 * `Bundler.require(*Rails.groups)`. The app's `package.json` is its Gemfile and
 * its `dependencies` are the `:default` group; each `@blazetrails/*` gem port
 * listed there is imported from the app's `node_modules`, as Bundler requires
 * each gem by its name. A port is found in the nearest `node_modules` at or
 * above the app, as Node resolves a bare specifier.
 *
 * @noRailsEquivalent PERMANENT
 */
export const Bundler = {
  /** @noRailsEquivalent PERMANENT */
  async require(...groups: string[]): Promise<void> {
    if (groups.length === 0) groups = ["default"];
    if (!groups.includes("default")) return;
    const gemfile = await Bundler.defaultGemfile();
    const gemRoot = File.dirname(gemfile);
    const dependencies = (JSON.parse(await File.readAsync(gemfile)) as { dependencies?: object })
      .dependencies;
    for (const name of Object.keys(dependencies ?? {})) {
      if (!name.startsWith("@blazetrails/")) continue;
      let root = gemRoot;
      let dir = File.join(root, "node_modules", name);
      while (!(await File.isExistAsync(File.join(dir, "package.json")))) {
        const parent = File.dirname(root);
        if (parent === root) {
          const error = new LoadError(`cannot load such file -- ${name}`);
          error.path = name;
          throw error;
        }
        root = parent;
        dir = File.join(root, "node_modules", name);
      }
      const manifest = File.join(dir, "package.json");
      const json = JSON.parse(await File.readAsync(manifest)) as {
        exports?: unknown;
        main?: string;
      };
      const dot =
        json.exports != null && typeof json.exports === "object" && "." in json.exports
          ? (json.exports as Record<string, unknown>)["."]
          : json.exports;
      const entry =
        typeof dot === "string"
          ? dot
          : dot != null && typeof dot === "object"
            ? ((dot as Record<string, unknown>).import ?? (dot as Record<string, unknown>).default)
            : (json.main ?? "index.js");
      if (typeof entry !== "string") continue;
      await import(new URL(`file://${File.expandPath(entry, dir)}`).href);
    }
  },

  /**
   * `Bundler::SharedHelpers#default_gemfile`
   * (`vendor/ruby/v3.3.11/lib/bundler/shared_helpers.rb:21`): the nearest
   * `package.json` at or above the working directory.
   *
   * @noRailsEquivalent PERMANENT
   */
  async defaultGemfile(): Promise<string> {
    let dir = Dir.pwd();
    for (;;) {
      const gemfile = File.join(dir, "package.json");
      if (await File.isExistAsync(gemfile)) return gemfile;
      const parent = File.dirname(dir);
      if (parent === dir) throw new LoadError("Could not locate Gemfile");
      dir = parent;
    }
  },
};
