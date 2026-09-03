import { underscore } from "@blazetrails/activesupport";
import { Dir, File, getPathAsync } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "./generators/base.js";

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

const GENERATORS_ROOT = new URL("./generators/rails/", import.meta.url);

function urlToPath(url: URL): string {
  const p = decodeURIComponent(url.pathname);
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
}

export class Generators {
  private constructor() {
    throw new Error("Generators is a static-only namespace; do not instantiate.");
  }

  static subclasses(): readonly GeneratorClass[] {
    return _subclasses ?? [];
  }

  /** @internal */
  static async lookupBang(): Promise<void> {
    if (_subclasses) return;
    const path = await getPathAsync();
    if (!path.pathToFileURL) {
      throw new Error("PathAdapter.pathToFileURL() is required to look up generators.");
    }
    const root = urlToPath(GENERATORS_ROOT);
    const found: GeneratorClass[] = [];
    const walk = async (dir: string, namespace: string[]): Promise<void> => {
      const entries = Dir.children(dir);
      for (const entry of entries.slice().sort()) {
        const full = path.join(dir, entry);
        if (File.isDirectory(full)) {
          await walk(full, [...namespace, underscore(entry.replace(/-/g, "_"))]);
        } else if (/-generator\.[cm]?[tj]s$/.test(entry) && !/\.(test|d)\./.test(entry)) {
          const klass = await importGenerator(path.pathToFileURL!(full).href);
          if (klass) {
            Object.defineProperty(klass, "namespace", {
              value: ["rails", ...namespace].join(":"),
              configurable: true,
            });
            found.push(klass);
          }
        }
      }
    };
    await walk(root, []);
    _subclasses = found;
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
    await Generators.lookupBang();
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
    return klass.start(args, config);
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
  static namespacesForHelp(): Array<{ name: string; namespace: string; hidden: boolean }> {
    return Generators.subclasses().map((k) => {
      const name = k.namespace.startsWith("rails:")
        ? k.namespace.slice("rails:".length)
        : k.namespace;
      const hidden =
        HIDDEN_FROM_LISTING.includes(name) || Generators.hiddenNamespaces().includes(name);
      return { name, namespace: k.namespace, hidden };
    });
  }

  /** @missingRailsArgs print_list — PERMANENT */
  static async printGenerators(output: (msg: string) => void): Promise<void> {
    for (const [base, namespaces] of await Generators.sortedGroups()) {
      Generators.printList(base, namespaces, output);
    }
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

async function importGenerator(href: string): Promise<GeneratorClass | undefined> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(href)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && value.prototype instanceof GeneratorBase) {
      return value as unknown as GeneratorClass;
    }
  }
  return undefined;
}
