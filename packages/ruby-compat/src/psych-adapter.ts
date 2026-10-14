import { LoadError } from "./load-error.js";

/**
 * The libyaml binding `psych.so` stands behind (`vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`): by default the npm `yaml` package, an optional
 * dependency, resolved on first use. Psych's own visitors read the rest of the
 * backend's members by name.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface PsychAdapter {
  parse(src: string, ...options: unknown[]): unknown;
  stringify(value: unknown, ...options: unknown[]): string;
}

/**
 * A node of the backend's tree, as Psych reads it: `Psych::Nodes::Node#tag`
 * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/node.rb:20`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface PsychNode {
  tag?: string | null;
}

/**
 * The tree `YAMLTree#tree` answers, emitted by `Psych::Nodes::Node#yaml`
 * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/nodes/node.rb:58-64`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface PsychDocument {
  yaml(
    io?: null,
    options?: { indentation?: number; canonical?: boolean; lineWidth?: number },
  ): string;
}

const registry = new Map<string, PsychAdapter>();
let currentAdapterName: string | null = null;
let resolved: PsychAdapter | null = null;

/**
 * Seats a backend for `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13` `require 'psych.so'`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function registerPsychAdapter(name: string, adapter: PsychAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("yaml")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = (globalThis as { process?: NodeProcess }).process;
    if (!proc?.versions?.node || typeof proc.getBuiltinModule !== "function") return false;
    const nodeModule = proc.getBuiltinModule("node:module") as {
      createRequire(p: string): (id: string) => unknown;
    };
    registry.set("yaml", nodeModule.createRequire(import.meta.url)("yaml") as PsychAdapter);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the backend as `psych.rb:13`'s `require 'psych.so'` would, at the
 * call: the configured adapter, else one registered as `yaml`, else a synchronous
 * Node load of `yaml`. A miss raises the `LoadError` `vendor/ruby/v3.3.11/lib/yaml.rb:3-18`
 * re-raises.
 */
function resolve(): PsychAdapter {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new LoadError(`cannot load such file -- ${name}`);
    return (resolved = reg);
  }
  if (tryAutoRegisterNode()) {
    return (resolved = registry.get("yaml")!);
  }
  throw new LoadError("cannot load such file -- yaml");
}

/**
 * Names the backend `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13` `require 'psych.so'` loads.
 *
 * @noRailsEquivalent PERMANENT
 */
export const psychAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};

/**
 * The backend behind `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`, resolved member by member on first read, so importing
 * this module never loads it.
 *
 * @noRailsEquivalent PERMANENT
 */
export const yaml: PsychAdapter = new Proxy({} as PsychAdapter, {
  get: (_target, member) => (resolve() as unknown as Record<PropertyKey, unknown>)[member],
});

/**
 * The backend's own value parser, behind `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`. Not `Psych.parse` (`:398`), which answers a node tree.
 * libyaml reads the source's bytes (`yaml_parser_set_input_string`,
 * `vendor/ruby/v3.3.11/ext/psych/psych_parser.c:271`), so a source held as its
 * bytes is decoded here; malformed bytes raise `SyntaxError` (`Psych::SyntaxError`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function parse(src: string | Uint8Array, ...options: unknown[]): unknown {
  if (src instanceof Uint8Array) {
    try {
      src = new TextDecoder("utf-8", { fatal: true }).decode(src);
    } catch {
      throw new SyntaxError("invalid leading UTF-8 octet");
    }
  }
  return resolve().parse(src, ...options);
}

/**
 * The backend's own emitter, behind `vendor/ruby/v3.3.11/ext/psych/lib/psych.rb:13`
 * `require 'psych.so'`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function stringify(value: unknown, ...options: unknown[]): string {
  return resolve().stringify(value, ...options);
}
