import { dasherize, deepMergeBang, underscore } from "@blazetrails/activesupport";
import { Dir, File, LoadError, getPath, regexpEscape } from "@blazetrails/ruby-compat";
import type { GeneratorBase, GeneratorOptions } from "./generators/base.js";
import type {
  AfterGenerateCallback,
  Generators as GeneratorsConfiguration,
} from "./configuration.js";

export type GeneratorClass = Omit<typeof GeneratorBase, "prototype" | "start"> & {
  readonly prototype: GeneratorBase;
  readonly name: string;
  namespace: string;
  start(args: string[], config: GeneratorOptions): Promise<string[]>;
};

const HIDDEN_FROM_LISTING = [
  "app",
  "plugin",
  "encrypted_file",
  "encryption_key_file",
  "master_key",
  "credentials",
  "db:system:change",
];

let _subclasses: GeneratorClass[] | undefined;
let _hiddenNamespaces: string[] | undefined;
let _commandType: string | undefined;
let _lookupPaths: URL[] | undefined;
let _aliases: Record<string, Record<string, unknown>> | undefined;
let _options: Record<string, Record<string, unknown>> | undefined;
let _afterGenerateCallbacks: AfterGenerateCallback[] | undefined;
let _generatedFiles: string[] | undefined;

const EXTENSION = /\.[cm]?[tj]s$/.exec(import.meta.url)![0];

function urlToPath(url: URL): string {
  const p = decodeURIComponent(url.pathname);
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
}

export class Generators {
  static readonly DEFAULT_ALIASES: Record<string, Record<string, unknown>> = {
    rails: {
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
    rails: {
      api: false,
      assets: true,
      forcePlural: false,
      helper: true,
      integrationTool: null,
      orm: false,
      resourceController: "controller",
      resourceRoute: true,
      scaffoldController: "scaffold_controller",
      systemTests: null,
      testFramework: null,
      templateEngine: "tse",
    },
  };

  static readonly RAILS_DEV_PATH: string = File.expandPath(
    "../../..",
    urlToPath(new URL(".", import.meta.url)),
  );

  private constructor() {
    throw new Error("Generators is a static-only namespace; do not instantiate.");
  }

  static configureBang(config: GeneratorsConfiguration): void {
    deepMergeBang(Generators.aliases(), config.aliases as never);
    deepMergeBang(Generators.options(), config.options as never);
    Generators.hideNamespaces(...config.hiddenNamespaces);
    Generators.afterGenerateCallbacks().splice(0, Infinity, ...config.afterGenerateCallbacks);
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

  static subclasses(): readonly GeneratorClass[] {
    return _subclasses ?? [];
  }

  /** @internal */
  static async lookup(namespaces: string[]): Promise<void> {
    const paths = Generators.namespacesToPaths(namespaces);

    for (const rawPath of paths) {
      for (const base of Generators.lookupPaths()) {
        const path = `${urlToPath(base)}${dasherize(rawPath)}-${Generators.commandType()}${EXTENSION}`;

        try {
          await requireGenerator(base, path);
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
    const walk = async (base: URL, dir: string): Promise<void> => {
      for (const entry of Dir.children(dir).slice().sort()) {
        const full = getPath().join(dir, entry);
        if (File.isDirectory(full)) {
          await walk(base, full);
        } else if (/-generator\.[cm]?[tj]s$/.test(entry) && !/\.(test|d)\./.test(entry)) {
          await requireGenerator(base, full).catch(() => undefined);
        }
      }
    };
    for (const base of Generators.lookupPaths())
      await walk(base, getPath().join(urlToPath(base), "rails"));
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

  static async findByNamespace(name: string, base?: string): Promise<GeneratorClass | undefined> {
    const lookups: string[] = [];
    if (base) lookups.push(`${base}:${name}`);
    if (!base) {
      if (!name.includes(":")) {
        lookups.push(`${name}:${name}`);
        lookups.push(`rails:${name}`);
      }
      lookups.push(name);
    }
    await Generators.lookup(lookups);

    const namespaces = new Map(Generators.subclasses().map((k) => [k.namespace, k]));
    for (const namespace of lookups) {
      const klass = namespaces.get(namespace);
      if (klass) return klass;
    }
    return undefined;
  }

  static async invoke(
    namespace: string,
    args: string[],
    config: GeneratorOptions,
  ): Promise<string[]> {
    const names = namespace.split(":");
    const name = names.pop()!;
    const klass = await Generators.findByNamespace(
      name,
      names.length ? names.join(":") : undefined,
    );
    if (!klass) {
      throw new Error(
        `Could not find generator '${namespace}'.\n` +
          "Run `bin/trails generate --help` for more options.\n",
      );
    }
    const files = await klass.start(args, config);
    if (config.behavior === "invoke") Generators.runAfterGenerateCallback();
    return files;
  }

  static addGeneratedFile(file: string): string {
    (_generatedFiles ??= []).push(file);
    return file;
  }

  static async publicNamespaces(): Promise<string[]> {
    await Generators.lookupBang();
    return Generators.subclasses().map((k) => k.namespace);
  }

  static hiddenNamespaces(): string[] {
    return (_hiddenNamespaces ??= ["rails", "resource_route", "devcontainer"]);
  }

  static hideNamespaces(...namespaces: string[]): void {
    Generators.hiddenNamespaces().push(...namespaces);
  }

  static async sortedGroups(): Promise<Array<[string, string[]]>> {
    const namespaces = (await Generators.publicNamespaces()).sort();

    const groups = new Map<string, string[]>();
    for (const namespace of namespaces) {
      const base = namespace.split(":")[0];
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(namespace);
    }

    const rails = (groups.get("rails") ?? []).map((n) =>
      n.startsWith("rails:") ? n.slice("rails:".length) : n,
    );
    groups.delete("rails");
    for (const n of HIDDEN_FROM_LISTING) {
      const i = rails.indexOf(n);
      if (i !== -1) rails.splice(i, 1);
    }

    for (const n of Generators.hiddenNamespaces()) groups.delete(n);

    return [["rails", rails], ...[...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))];
  }

  /** @noRailsEquivalent PERMANENT */
  static namespacesForHelp(): Array<{
    name: string;
    namespace: string;
    hidden: boolean;
    klass: GeneratorClass;
  }> {
    return Generators.subclasses().map((k) => {
      const name = k.namespace.startsWith("rails:")
        ? k.namespace.slice("rails:".length)
        : k.namespace;
      const hidden =
        HIDDEN_FROM_LISTING.includes(name) || Generators.hiddenNamespaces().includes(name);
      return { name, namespace: k.namespace, hidden, klass: k };
    });
  }

  /** @missingRailsArgs print_list — PERMANENT */
  static async printGenerators(output: (msg: string) => void): Promise<void> {
    for (const [base, namespaces] of await Generators.sortedGroups()) {
      Generators.printList(base, namespaces, output);
    }
  }

  private static runAfterGenerateCallback(): void {
    if (_generatedFiles !== undefined && _generatedFiles.length !== 0) {
      for (const callback of Generators.afterGenerateCallbacks()) {
        callback(_generatedFiles);
      }
      _generatedFiles = [];
    }
  }

  private static commandType(): string {
    return (_commandType ??= "generator");
  }

  private static lookupPaths(): URL[] {
    return (_lookupPaths ??= [new URL("./generators/", import.meta.url)]);
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

async function requireGenerator(base: URL, path: string): Promise<void> {
  if (!File.isExist(path)) throw new LoadError(`cannot load such file -- ${path}`);
  const { GeneratorBase } = await import("./generators/base.js");
  const mod = (await import(getPath().pathToFileURL!(path).href)) as Record<string, unknown>;
  const namespace = getPath()
    .dirname(path.slice(urlToPath(base).length))
    .split(/[\\/]/);
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && value.prototype instanceof GeneratorBase) {
      const klass = value as unknown as GeneratorClass;
      Object.defineProperty(klass, "namespace", {
        value: namespace.map((piece) => underscore(piece.replace(/-/g, "_"))).join(":"),
        configurable: true,
      });
      _subclasses ??= [];
      if (!_subclasses.includes(klass)) _subclasses.push(klass);
      return;
    }
  }
}
