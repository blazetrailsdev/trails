import { camelize } from "@blazetrails/activesupport";
import { Hash } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "@blazetrails/thor";
import type { GroupClass } from "@blazetrails/thor/group.js";
import { ViteAssets } from "./vite-assets.js";
import { Build } from "./cli/build.js";
import { Clobber } from "./cli/clobber.js";
import { Command } from "./cli/command.js";
import { Dev } from "./cli/dev.js";
import { FileUtils } from "./cli/file-utils.js";
import { Install } from "./cli/install.js";
import { SSR } from "./cli/ssr.js";
import { Upgrade } from "./cli/upgrade.js";
import { UpgradePackages } from "./cli/upgrade-packages.js";
import { Version } from "./cli/version.js";
import { Vite } from "./cli/vite.js";
import { rbClearMethodCache } from "@blazetrails/ruby-compat";

export class CLI extends Thor {
  declare static Build: typeof Build;
  declare static Clobber: typeof Clobber;
  declare static Dev: typeof Dev;
  declare static FileUtils: typeof FileUtils;
  declare static Install: typeof Install;
  declare static SSR: typeof SSR;
  declare static Upgrade: typeof Upgrade;
  declare static UpgradePackages: typeof UpgradePackages;
  declare static Version: typeof Version;
  declare static Vite: typeof Vite;

  /** @noRailsEquivalent PERMANENT */
  static override register(
    this: ThorClass,
    name: string | ThorClass | GroupClass,
    klass: typeof Command | string,
    ...rest: unknown[]
  ): void {
    if (typeof name !== "string") {
      return Thor.register.call(this, name, klass as string, ...(rest as [string, string]));
    }
    const { aliases = [] } = (rest[0] ?? {}) as { aliases?: string[] };
    klass = klass as typeof Command;
    this.desc(name, klass._description);
    for (const [
      option,
      { type = "string", values, aliases: optionAliases = [], ...rest },
    ] of Object.entries(klass._options)) {
      this.methodOption(option, {
        ...rest,
        type,
        enum: values,
        aliases: optionAliases
          .filter((alias) => alias !== option.replaceAll("_", "-"))
          .map((alias) => (alias.length === 1 ? `-${alias}` : `--${alias}`)),
      });
    }
    Object.defineProperty(this.prototype, name, {
      value: function (this: { options: Hash<string, unknown> }, ...args: string[]) {
        const options = Object.fromEntries(
          this.options.toA().map(([key, value]) => [camelize(key, false), value]),
        );
        return new klass().call({ ...options, args });
      },
      writable: true,
      configurable: true,
    });
    rbClearMethodCache();
    this.methodAdded(name);
    if (aliases.length > 0) this.map(Object.fromEntries(aliases.map((alias) => [alias, name])));
  }

  static {
    const klass = this as unknown as typeof CLI & ThorClass;
    klass.register("build", Build, { aliases: ["b"] });
    klass.register("clobber", Clobber, { aliases: ["clean", "clear"] });
    klass.register("dev", Dev, { aliases: ["d", "serve"] });
    klass.register("install", Install);
    klass.register("ssr", SSR);
    klass.register("version", Version, { aliases: ["v", "-v", "--version", "info"] });
    klass.register("upgrade", Upgrade, { aliases: ["update"] });
    klass.register("upgrade_packages", UpgradePackages, { aliases: ["update_packages"] });
  }

  static isExitOnFailure(): boolean {
    return true;
  }

  static async requireFrameworkLibraries(path: string | null = "cli"): Promise<void> {
    try {
      for (const [, library] of await ViteAssets.frameworkLibraries()) {
        await import(`${[library.name, path].filter((x) => x != null).join("/")}.js`);
      }
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND") throw error;
      if (path !== "installation") await this.requireFrameworkLibraries("installation");
    }
  }
}

CLI.Build = Build;
CLI.Clobber = Clobber;
CLI.Dev = Dev;
CLI.FileUtils = FileUtils;
CLI.Install = Install;
CLI.SSR = SSR;
CLI.Upgrade = Upgrade;
CLI.UpgradePackages = UpgradePackages;
CLI.Version = Version;
CLI.Vite = Vite;

ViteAssets.CLI = CLI;

await CLI.requireFrameworkLibraries("cli");
