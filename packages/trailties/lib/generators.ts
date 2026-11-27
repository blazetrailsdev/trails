import { dasherize, deepMergeBang, mattrAccessor, underscore } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/core-ext/string/inflections";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { getPath } from "@blazetrails/ruby-compat/fs-adapter";
import { STDOUT } from "@blazetrails/ruby-compat/io";
import { LOAD_PATH } from "@blazetrails/ruby-compat/load";
import { LoadError } from "@blazetrails/ruby-compat/load-error";
import { regexpEscape } from "@blazetrails/ruby-compat/regexp";
import { exit } from "@blazetrails/ruby-compat/process-adapter";
import type { Base, GeneratorConfig } from "./generators/base.js";
import { noColorBang, printList as behaviorPrintList } from "./command/behavior.js";
import { CorrectableNameError } from "./command.js";
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
let _fileLookupPaths: string[] | undefined;
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
  declare static namespace: { readonly name: string } | null;

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
          await requireGenerator(File.join(found, `${path}${EXTENSION}`));
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
    for (const dir of LOAD_PATH) {
      for (const path of await Dir.globAsync(File.join(dir, ...Generators.fileLookupPaths()))) {
        const base = Generators.lookupPaths().find((b) =>
          path.startsWith(File.join(dir, b) + "/"),
        )!;
        await requireGenerator(path).catch(() => undefined);
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
    if (klass) {
      if (args.length === 0 && klass.arguments().some((a) => a.isRequired())) args.push("--help");
      await klass.start(args, config);
      if (config.behavior === "invoke") await Generators.runAfterGenerateCallback();
    } else {
      const options = (await Generators.sortedGroups()).flatMap(([, namespaces]) => namespaces);
      const error = new CorrectableNameError(
        `Could not find generator '${namespace}'.`,
        namespace,
        options,
      );

      STDOUT.puts(
        `${error.detailedMessage()}\nRun \`bin/trails generate --help\` for more options.\n`,
      );
      exit(1);
    }
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
    if (_hiddenNamespaces === undefined) {
      const orm = dasherize(underscore(`${Generators.options().trails.orm ?? ""}`));
      const test = dasherize(underscore(`${Generators.options().trails.testFramework ?? ""}`));
      const template = dasherize(underscore(`${Generators.options().trails.templateEngine ?? ""}`));

      _hiddenNamespaces = [
        "trails",
        "resource-route",
        `${orm}:migration`,
        `${orm}:model`,
        `${test}:controller`,
        `${test}:helper`,
        `${test}:integration`,
        `${test}:system`,
        `${test}:mailer`,
        `${test}:model`,
        `${test}:scaffold`,
        `${test}:view`,
        `${test}:job`,
        `${template}:controller`,
        `${template}:scaffold`,
        `${template}:mailer`,
        "action-text:install",
        "action-mailbox:install",
        "devcontainer",
      ];
    }
    return _hiddenNamespaces;
  }

  static hideNamespaces(...namespaces: string[]): void {
    Generators.hiddenNamespaces().push(...namespaces);
  }

  static hideNamespace = this.hideNamespaces;

  static async help(command: string = "generate"): Promise<void> {
    STDOUT.puts("Usage:");
    STDOUT.puts(`  bin/trails ${command} GENERATOR [args] [options]`);
    STDOUT.puts();
    STDOUT.puts("General options:");
    STDOUT.puts("  -h, [--help]     # Print generator's options and usage");
    STDOUT.puts("  -p, [--pretend]  # Run but do not make any changes");
    STDOUT.puts("  -f, [--force]    # Overwrite files that already exist");
    STDOUT.puts("  -s, [--skip]     # Skip files that already exist");
    STDOUT.puts("  -q, [--quiet]    # Suppress status output");
    STDOUT.puts();
    STDOUT.puts("Please choose a generator below.");
    STDOUT.puts();

    await Generators.printGenerators();
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

  static async printGenerators(): Promise<void> {
    for (const [base, namespaces] of await Generators.sortedGroups()) {
      Generators.printList(base, namespaces);
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

  private static fileLookupPaths(): string[] {
    return (_fileLookupPaths ??= [
      `{${Generators.lookupPaths().join(",")}}`,
      "**",
      `*-generator${EXTENSION}`,
    ]);
  }

  private static printList(base: string, namespaces: string[]): void {
    namespaces = namespaces.filter((n) => !Generators.hiddenNamespaces().includes(n));
    behaviorPrintList(base, namespaces);
  }
}

async function requireGenerator(path: string): Promise<void> {
  if (!File.isExist(path)) throw new LoadError(`cannot load such file -- ${path}`);
  const { Base } = await import("./generators/base.js");
  const mod = (await import(getPath().pathToFileURL!(path).href)) as Record<string, unknown>;
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && value.prototype instanceof Base) {
      const klass = value as unknown as GeneratorClass;
      _subclasses ??= [];
      if (!_subclasses.includes(klass)) _subclasses.push(klass);
      return;
    }
  }
}

mattrAccessor.call(Generators, "namespace");

Trails.Generators = Generators;
