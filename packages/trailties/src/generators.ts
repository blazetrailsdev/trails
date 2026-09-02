// Port of `Rails::Generators` from `railties/lib/rails/generators.rb` and the
// lookup half it gets from `Rails::Command::Behavior`
// (`railties/lib/rails/command/behavior.rb:36-80`).
//
// Modeled as a class with statics (cf. `rails.ts`) so the api-compare
// extractor harvests the members; `Generators` is never instantiated.
import { getFsAsync, getPathAsync, underscore } from "@blazetrails/activesupport";
import { GeneratorBase, type GeneratorOptions } from "./generators/base.js";

/**
 * A generator class as {@link Generators.invoke} calls it — Rails reaches
 * `start` through Thor (`generators.rb:265`).
 */
export type GeneratorClass = Omit<typeof GeneratorBase, "prototype" | "start"> & {
  readonly prototype: GeneratorBase;
  readonly name: string;
  namespace: string;
  start(args: string[], config: GeneratorOptions): Promise<string[]>;
};

/**
 * The `rails` group entries `sorted_groups` deletes before printing
 * (`generators.rb:208-214`) — still invocable, just not advertised.
 */
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

/**
 * Rails' `file_lookup_paths` is `["{rails/generators,generators}", "**", "*_generator.rb"]`
 * (`generators.rb:314-316`). trails ships its generators in one tree, so the
 * glob is that tree walked for `*-generator.{ts,js}`.
 */
const GENERATORS_ROOT = new URL("./generators/rails/", import.meta.url);

/** `file:` URL → path, without a `node:url` import. */
function urlToPath(url: URL): string {
  const p = decodeURIComponent(url.pathname);
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
}

export class Generators {
  private constructor() {
    throw new Error("Generators is a static-only namespace; do not instantiate.");
  }

  /**
   * Rails: `Rails::Generators.subclasses` — the generator classes `lookup!`
   * has loaded. Empty until {@link Generators.lookupBang} has run; Ruby fills
   * it through Thor's `inherited` hook, which JS has no analogue for, so the
   * scan itself collects the classes.
   */
  static subclasses(): readonly GeneratorClass[] {
    return _subclasses ?? [];
  }

  /**
   * Rails: `lookup!` (`command/behavior.rb:56-65`) — load every generator on
   * the load path so `help` can list them. Cached: the ESM module registry
   * already dedupes the imports, and callers reach it through
   * {@link Generators.findByNamespace} on every invocation.
   *
   * @internal
   */
  static async lookupBang(): Promise<void> {
    if (_subclasses) return;
    const fs = await getFsAsync();
    const path = await getPathAsync();
    if (!path.pathToFileURL) {
      throw new Error("PathAdapter.pathToFileURL() is required to look up generators.");
    }
    const root = urlToPath(GENERATORS_ROOT);
    const found: GeneratorClass[] = [];
    const walk = async (dir: string, namespace: string[]): Promise<void> => {
      const entries = fs.readdir ? await fs.readdir(dir) : [];
      for (const entry of entries.slice().sort()) {
        const full = path.join(dir, entry);
        if (await isDirectory(fs, full)) {
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

  /**
   * Rails: `find_by_namespace(name, base = nil, context = nil)`
   * (`generators.rb:234-259`). The `context` arm and the fallbacks Rails
   * consults after the lookup miss belong to generator groups (`test_unit`,
   * `shoulda`) that trails has no analogue for.
   */
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

  /**
   * Rails: `invoke(namespace, args = ARGV, config = {})` (`generators.rb:261-278`).
   *
   * Rails prints a correctable-name error and `exit 1`s on a miss; trails
   * throws so the CLI layer decides. The two calls in the found arm that this
   * body does not make —
   * `args << "--help" if args.empty? && klass.arguments.any?(&:required?)`
   * (`generators.rb:264`) and `run_after_generate_callback`
   * (`generators.rb:266`) — both read Thor state trails has no port of:
   * `class_option`/`argument` declarations and
   * `Generators.after_generate_callbacks`.
   */
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
      throw new Error(`Could not find generator '${namespace}'.`);
    }
    return klass.start(args, config);
  }

  /** Rails: `public_namespaces` (`generators.rb:187-190`). */
  static async publicNamespaces(): Promise<string[]> {
    await Generators.lookupBang();
    return Generators.subclasses().map((k) => k.namespace);
  }

  /**
   * Rails: `hidden_namespaces` (`generators.rb:134-160`). Only the entries
   * whose subsystem trails has: the ORM/test-framework/template-engine groups
   * Rails interpolates do not exist here.
   */
  static hiddenNamespaces(): string[] {
    return (_hiddenNamespaces ??= ["rails", "resource_route"]);
  }

  /** Rails: `sorted_groups` (`generators.rb:196-219`). */
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

  /**
   * The namespaces {@link Generators.lookupBang} has already loaded, in the
   * short form Rails prints them in, each flagged with whether
   * {@link Generators.sortedGroups} would list it.
   *
   * @noRailsEquivalent PERMANENT — Thor asks the loaded registry for the
   * command list at print time, after `lookup!`; commander needs the whole
   * subcommand tree before `parse`, and `lookup!` is async, so the CLI reads
   * the warm cache synchronously instead.
   */
  static namespacesForHelp(): Array<{ name: string; namespace: string; hidden: boolean }> {
    return Generators.subclasses().map((k) => {
      const name = k.namespace.startsWith("rails:")
        ? k.namespace.slice("rails:".length)
        : k.namespace;
      return { name, namespace: k.namespace, hidden: HIDDEN_FROM_LISTING.includes(name) };
    });
  }

  /**
   * Rails: `print_generators` (`generators.rb:192-194`). Ruby prints through
   * `puts`; the port takes the sink because trails has no process-global
   * stdout to reach for.
   */
  static async printGenerators(output: (msg: string) => void): Promise<void> {
    for (const [base, namespaces] of await Generators.sortedGroups()) {
      Generators.printList(base, namespaces, output);
    }
  }

  /**
   * Rails: `print_list(base, namespaces)` (`generators.rb:286-289`), whose
   * `super` is Thor's — it prints the capitalized group and one indented line
   * per namespace, and prints nothing for an empty group.
   */
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

async function isDirectory(
  fs: Awaited<ReturnType<typeof getFsAsync>>,
  p: string,
): Promise<boolean> {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Rails' `require path` inside `lookup!` — Thor's `inherited` hook then files
 * the class into `subclasses`. JS has no such hook, so the module's exports
 * are searched for the generator class instead.
 */
async function importGenerator(href: string): Promise<GeneratorClass | undefined> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(href)) as Record<string, unknown>;
  } catch {
    // Rails: `rescue Exception; # No problem` (`command/behavior.rb:61-62`).
    return undefined;
  }
  for (const value of Object.values(mod)) {
    if (typeof value === "function" && value.prototype instanceof GeneratorBase) {
      return value as unknown as GeneratorClass;
    }
  }
  return undefined;
}
