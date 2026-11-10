import { dasherize, deepMergeBang, underscore } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/core-ext/string/inflections";
import { Dir, File, LOAD_PATH, LoadError, getPath, regexpEscape } from "@blazetrails/ruby-compat";
import type { Base, GeneratorConfig } from "./generators/base.js";
import { noColorBang } from "./command/behavior.js";
import { Trails } from "./trails.js";
import type {
  AfterGenerateCallback,
  Generators as GeneratorsConfiguration,
} from "./configuration.js";

export type GeneratorClass = Omit<typeof Base, "prototype"> & {
  readonly prototype: Base;
  readonly name: string;
};

const HIDDEN_FROM_LISTING = [
  "app",
  "plugin",
  "encrypted-file",
  "encryption-key-file",
  "master-key",
  "credentials",
  "db:system:change",
];

let _subclasses: GeneratorClass[] | undefined;
let _hiddenNamespaces: string[] | undefined;
let _commandType: string | undefined;
let _lookupPaths: string[] | undefined;
let _aliases: Record<string, Record<string, unknown>> | undefined;
let _options: Record<string, Record<string, unknown>> | undefined;
let _fallbacks: Record<string, unknown> | undefined;
let _templatesPath: string[] | undefined;
let _afterGenerateCallbacks: AfterGenerateCallback[] | undefined;
let _generatedFiles: string[] | undefined;

const EXTENSION = /\.[cm]?[tj]s$/.exec(import.meta.url)![0];

function urlToPath(url: URL): string {
  const p = decodeURIComponent(url.pathname);
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
}

export class Generators {
  static namespace: { readonly name: string } | null = null;

  static readonly DEFAULT_ALIASES: Record<string, Record<string, unknown>> = {
    trails: {
      actions: "-a",
      orm: "-o",
      javascripts: ["-j", "--js"],
      resourceController: "-c",
      scaffoldController: "-c",
      stylesheets: "-y",
      templateEngine: "-e",
      testFramework: "-t",
    },

    test_unit: {
      fixtureReplacement: "-r",
    },
  };

  static readonly DEFAULT_OPTIONS: Record<string, Record<string, unknown>> = {
    trails: {
      api: false,
      assets: true,
      forcePlural: false,
      helper: true,
      integrationTool: null,
      orm: false,
      resourceController: "controller",
      resourceRoute: true,
      scaffoldController: "scaffold-controller",
      systemTests: null,
      testFramework: null,
      templateEngine: "tse",
    },
  };

  static readonly TRAILS_DEV_PATH: string = File.expandPath(
    "../../..",
    urlToPath(new URL(".", import.meta.url)),
  );

  private constructor() {
    throw new Error("Generators is a static-only namespace; do not instantiate.");
  }

  static configureBang(config: GeneratorsConfiguration): void {
    if (config.apiOnly) Generators.apiOnlyBang();
    if (!config.colorizeLogging) noColorBang();
    deepMergeBang(Generators.aliases(), config.aliases as never);
    deepMergeBang(Generators.options(), config.options as never);
    Object.assign(Generators.fallbacks(), config.fallbacks);
    Generators.templatesPath().push(...config.templates);
    Generators.templatesPath().splice(0, Infinity, ...new Set(Generators.templatesPath()));
    Generators.hideNamespaces(...config.hiddenNamespaces);
    Generators.afterGenerateCallbacks().splice(0, Infinity, ...config.afterGenerateCallbacks);
  }

  static templatesPath(): string[] {
    return (_templatesPath ??= []);
  }

  static aliases(): Record<string, Record<string, unknown>> {
    return (_aliases ??= { ...Generators.DEFAULT_ALIASES });
  }

  static options(): Record<string, Record<string, unknown>> {
    return (_options ??= { ...Generators.DEFAULT_OPTIONS });
  }

  static afterGenerateCallbacks(): AfterGenerateCallback[] {
    return (_afterGenerateCallbacks ??= []);
  }

  static fallbacks(): Record<string, unknown> {
    return (_fallbacks ??= {});
  }

  static subclasses(): readonly GeneratorClass[] {
    return _subclasses ?? [];
  }

  /** @internal */
  static async lookup(namespaces: string[]): Promise<void> {
    const paths = Generators.namespacesToPaths(namespaces);

    for (const rawPath of paths) {
      for (const base of Generators.lookupPaths()) {
        const path = `${base}/${dasherize(rawPath)}-${Generators.commandType()}`;

        try {
          let found: string | undefined;
          for (const dir of LOAD_PATH) {
            if (await File.isExistAsync(File.join(dir, `${path}${EXTENSION}`))) {
              found = dir;
              break;
            }
          }
          if (found === undefined) throw new LoadError(`cannot load such file -- ${path}`);
          await requireGenerator(found, base, File.join(found, `${path}${EXTENSION}`));
          return;
        } catch (e) {
          if (e instanceof LoadError) {
            if (!new RegExp(`${regexpEscape(path)}$`).test(e.message)) throw e;
          } else if (e instanceof Error) {
            console.warn(
              `[WARNING] Could not load ${Generators.commandType()} ${JSON.stringify(path)}. Error: ${e.message}.\n${e.stack}`,
            );
          }
        }
      }
    }
  }

  /** @internal */
  static async lookupBang(): Promise<void> {
    const walk = async (dir: string, base: string, sub: string): Promise<void> => {
      for (const entry of Dir.children(sub).slice().sort()) {
        const full = getPath().join(sub, entry);
        if (File.isDirectory(full)) {
          await walk(dir, base, full);
        } else if (/-generator\.[cm]?[tj]s$/.test(entry) && !/\.(test|d)\./.test(entry)) {
          await requireGenerator(dir, base, full).catch(() => undefined);
        }
      }
    };
    for (const dir of LOAD_PATH) {
      for (const base of Generators.lookupPaths()) {
        const root = File.join(dir, base, "trails");
        if (File.isDirectory(root)) await walk(dir, base, root);
      }
    }
  }

  /** @internal */
  static namespacesToPaths(namespaces: string[]): string[] {
    const paths: string[] = [];
    for (const namespace of namespaces) {
      const pieces = namespace.split(":");
      const path = pieces.join("/");
      paths.push(`${path}/${pieces.at(-1)}`);
      paths.push(path);
    }
    return [...new Set(paths)];
  }

  /** @inventedArm map — PERMANENT */
  static async findByNamespace(
    name: string,
    base: string | null = null,
    context: string | null = null,
  ): Promise<GeneratorClass | null> {
    let lookups: string[] = [];
    if (base != null) lookups.push(`${base}:${name}`);
    if (context != null) lookups.push(`${name}:${context}`);

    if (!(base != null || context != null)) {
      if (!name.includes(":")) {
        lookups.push(`${name}:${name}`);
        lookups.push(`trails:${name}`);
      }
      lookups.push(name);
    }

    lookups = lookups.map((namespace) => dasherize(underscore(namespace)));
    await Generators.lookup(lookups);

    const namespaces = new Map(Generators.subclasses().map((k) => [k.namespace(), k]));
    for (const namespace of lookups) {
      const klass = namespaces.get(namespace);
      if (klass) return klass;
    }

    return (
      (await Generators.invokeFallbacksFor(name, base)) ??
      (await Generators.invokeFallbacksFor(context, name))
    );
  }

  static async invoke(
    namespace: string,
    args: string[],
    config: GeneratorConfig = {},
  ): Promise<void> {
    const names = namespace.split(":");
    const name = names.pop()!;
    const klass = await Generators.findByNamespace(name, names.length ? names.join(":") : null);
    if (!klass) {
      throw new Error(
        `Could not find generator '${namespace}'.\n` +
          "Run `bin/trails generate --help` for more options.\n",
      );
    }
    if (args.length === 0 && klass.arguments().some((a) => a.isRequired())) args.push("--help");
    await klass.start(args, config);
    if (config.behavior === "invoke") await Generators.runAfterGenerateCallback();
  }

  static addGeneratedFile(file: string): string {
    (_generatedFiles ??= []).push(file);
    return file;
  }

  static async publicNamespaces(): Promise<string[]> {
    await Generators.lookupBang();
    return Generators.subclasses().map((k) => k.namespace());
  }

  static apiOnlyBang(): void {
    Generators.hideNamespaces("assets", "helper", "css", "js");

    Object.assign(Generators.options().trails, {
      api: true,
      assets: false,
      helper: false,
      templateEngine: null,
    });

    Generators.options().mailer ??= {};
    Generators.options().mailer.templateEngine ??= "tse";
  }

  static hiddenNamespaces(): string[] {
    return (_hiddenNamespaces ??= [
      "trails",
      "resource-route",
      "action-mailbox:install",
      "devcontainer",
    ]);
  }

  static hideNamespaces(...namespaces: string[]): void {
    Generators.hiddenNamespaces().push(...namespaces);
  }

  /** @missingRailsArgs print_generators — PERMANENT */
  static async help(
    command: string = "generate",
    output: (msg: string) => void = console.log,
  ): Promise<void> {
    output("Usage:");
    output(`  bin/trails ${command} GENERATOR [args] [options]`);
    output("");
    output("General options:");
    output("  -h, [--help]     # Print generator's options and usage");
    output("  -p, [--pretend]  # Run but do not make any changes");
    output("  -f, [--force]    # Overwrite files that already exist");
    output("  -s, [--skip]     # Skip files that already exist");
    output("  -q, [--quiet]    # Suppress status output");
    output("");
    output("Please choose a generator below.");
    output("");

    await Generators.printGenerators(output);
  }

  static async sortedGroups(): Promise<Array<[string, string[]]>> {
    const namespaces = (await Generators.publicNamespaces()).sort();

    const groups = new Map<string, string[]>();
    for (const namespace of namespaces) {
      const base = namespace.split(":")[0];
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(namespace);
    }

    const trails = (groups.get("trails") ?? []).map((n) =>
      n.startsWith("trails:") ? n.slice("trails:".length) : n,
    );
    groups.delete("trails");
    for (const n of HIDDEN_FROM_LISTING) {
      const i = trails.indexOf(n);
      if (i !== -1) trails.splice(i, 1);
    }

    for (const n of Generators.hiddenNamespaces()) groups.delete(n);

    return [["trails", trails], ...[...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))];
  }

  /** @missingRailsArgs print_list — PERMANENT */
  static async printGenerators(output: (msg: string) => void): Promise<void> {
    for (const [base, namespaces] of await Generators.sortedGroups()) {
      Generators.printList(base, namespaces, output);
    }
  }

  private static async runAfterGenerateCallback(): Promise<void> {
    if (_generatedFiles !== undefined && _generatedFiles.length !== 0) {
      for (const callback of Generators.afterGenerateCallbacks()) {
        await callback(_generatedFiles);
      }
      _generatedFiles = [];
    }
  }

  private static async invokeFallbacksFor(
    name: string | null,
    base: string | null,
  ): Promise<GeneratorClass | null> {
    const fallbacks = base != null ? Generators.fallbacks()[base] : null;
    if (!(fallbacks != null && fallbacks !== false)) return null;
    const invokedFallbacks: unknown[] = [];

    for (const fallback of [fallbacks].flat()) {
      if (invokedFallbacks.includes(fallback)) continue;
      invokedFallbacks.push(fallback);

      const klass = await Generators.findByNamespace(name!, fallback as string);
      if (klass) return klass;
    }

    return null;
  }

  private static commandType(): string {
    return (_commandType ??= "generator");
  }

  private static lookupPaths(): string[] {
    return (_lookupPaths ??= ["trails/generators", "generators"]);
  }

  private static printList(
    base: string,
    namespaces: string[],
    output: (msg: string) => void,
  ): void {
    namespaces = namespaces.filter((n) => !Generators.hiddenNamespaces().includes(n));
    if (namespaces.length === 0) return;
    output(`${base.charAt(0).toUpperCase()}${base.slice(1)}:`);
    for (const n of namespaces) output(`  ${n}`);
    output("");
  }
}

async function requireGenerator(dir: string, base: string, path: string): Promise<void> {
  if (!File.isExist(path)) throw new LoadError(`cannot load such file -- ${path}`);
  const { Base } = await import("./generators/base.js");
  const mod = (await import(getPath().pathToFileURL!(path).href)) as Record<string, unknown>;
  const namespace = getPath()
    .dirname(path.slice(File.join(dir, base).length + 1))
    .split(/[\\/]/);
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && value.prototype instanceof Base) {
      const klass = value as unknown as GeneratorClass;
      klass.namespace(namespace.join(":"));
      _subclasses ??= [];
      if (!_subclasses.includes(klass)) _subclasses.push(klass);
      return;
    }
  }
}

Trails.Generators = Generators;
