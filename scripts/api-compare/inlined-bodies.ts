import type {
  ApiManifest,
  CallSite,
  ClassInfo,
  InlinedFrom,
  MethodInfo,
} from "@blazetrails/parity/types";
import { TAG } from "./inlined-from-tags.js";

/** The Ruby call-set facts of one body, as compare.ts's call gate reads them. */
export interface RubyBody {
  calls: string[];
  weak: string[];
  receivers: Record<string, string[]>;
  receiverNames: Record<string, string[]>;
  stringEvals: string[];
}

/**
 * The `def` a tag cites, from whichever package's manifest defines the module.
 * Throws, naming `where` the tag sits, when the manifest holds no such `def`,
 * the manifest did not record where that `def` was read from, or the tag's
 * citation is not exactly that `def`'s path and line span.
 */
export function inlinedHookBody(ruby: ApiManifest, tag: InlinedFrom, where: string): MethodInfo {
  const name = `${tag.module}#${tag.hook}`;
  for (const pkg of Object.values(ruby.packages)) {
    const mod = pkg.modules[tag.module] as unknown as ClassInfo | undefined;
    const body = mod?.instanceMethods.find((m) => m.name === tag.hook);
    if (!body) continue;
    if (body.vendorFile === undefined) {
      throw new Error(
        `${TAG} cannot be checked: ${where} — the manifest's \`${name}\` has no vendorFile: ` +
          "its Ruby file was read from a path outside this checkout's vendor/.",
      );
    }
    const cited = `${tag.source}/${tag.version}/${tag.file}:${tag.firstLine}-${tag.lastLine}`;
    const actual = `${body.vendorFile}:${body.line}-${body.endLine}`;
    if (cited !== actual) {
      throw new Error(
        `${TAG} citation is stale: ${where} — \`${name}\` is cited at ${cited}, and the ` +
          `manifest has it at ${actual}. Rewrite it with \`pnpm parity:api:inlined:fix\`.`,
      );
    }
    return body;
  }
  throw new Error(`${TAG} names no Ruby body: ${where} — the manifest has no \`${name}\`.`);
}

/** The artifact compare.ts writes under `--calls`, in OUTPUT_DIR. */
export const INLINED_FROM_PAIRS_FILE = "inlined-from-pairs.json";

/** A tagged TS constructor and the Rails class compare.ts paired it with. */
export interface InlinedFromPair {
  package: string;
  tsFile: string;
  owner: string;
  rubyModule: string;
}

export interface ModuleBody {
  module: string;
  body: MethodInfo;
}

export interface ModuleAncestors {
  prepended: string[];
  included: string[];
}

/**
 * The modules ahead of and behind a class in its ancestors, as FQNs, each
 * module between its own prepends and includes. A later `include` / `prepend`
 * statement lands nearer the class than an earlier one, and the first argument
 * of one statement ahead of its second: `Module#include` appends its arguments
 * in reverse (`vendor/ruby/v3.3.11/eval.c:1139-1163`). Without `mixinOrder` the
 * flat lists are read as one statement per name.
 */
export function moduleAncestors(
  klass: ClassInfo,
  klassFqn: string,
  modules: Record<string, unknown>,
  resolve: (incName: string, contextFqn: string) => string,
  inherited: ReadonlySet<string> = new Set(),
): ModuleAncestors {
  const visited = new Set<string>(inherited);
  type Statement = { kind: string; names: string[]; context: string };
  const statements = (mod: ClassInfo | undefined, contextFqn: string): Statement[] => {
    const written = (
      mod?.mixinOrder ?? [
        { kind: "prepend", names: [...(mod?.prepends ?? [])].reverse() },
        { kind: "include", names: [...(mod?.includes ?? [])].reverse() },
      ]
    ).map((statement) => ({ ...statement, context: contextFqn }));
    return [
      ...written.flatMap((statement) => [
        statement,
        ...(statement.kind !== "include"
          ? []
          : statement.names.flatMap((name) => {
              const fqn = resolve(name, contextFqn);
              return ((modules[fqn] as ClassInfo | undefined)?.includedHookMixins ?? []).map(
                (hook) => ({ ...hook, context: fqn }),
              );
            })),
      ]),
      ...(mod?.bootMixins ?? []).map((statement) => ({ ...statement, context: contextFqn })),
    ];
  };
  const ordered = (mod: ClassInfo | undefined, contextFqn: string, kind: "include" | "prepend") =>
    statements(mod, contextFqn)
      .reverse()
      .filter((statement) => statement.kind === kind)
      .flatMap((statement) => statement.names.map((name) => [name, statement.context] as const));
  const walk = (names: readonly (readonly [string, string])[], into: string[]): void => {
    for (const [name, contextFqn] of names) {
      const fqn = resolve(name, contextFqn);
      if (visited.has(fqn)) continue;
      visited.add(fqn);
      const mod = modules[fqn] as ClassInfo | undefined;
      walk(ordered(mod, fqn, "prepend"), into);
      into.push(fqn);
      walk(ordered(mod, fqn, "include"), into);
    }
  };
  const ancestors: ModuleAncestors = { prepended: [], included: [] };
  walk(ordered(klass, klassFqn, "prepend"), ancestors.prepended);
  walk(ordered(klass, klassFqn, "include"), ancestors.included);
  return ancestors;
}

/**
 * The modules `klass`'s superclass chain already holds. `include_modules_at`
 * skips a module it finds there (vendor/ruby/v3.3.11/class.c:1281,1291,1296), so
 * `ResourceHelpers.included`'s `base.include(ModelHelpers)` adds nothing to a
 * `ResourceGenerator` whose `ModelGenerator` superclass includes it. A
 * `DelegateClass(Value)` superclass is a `Delegator`, not `Value`, so the walk
 * stops there.
 */
export function inheritedModules(
  klass: ClassInfo,
  klassFqn: string,
  classes: Record<string, unknown>,
  modules: Record<string, unknown>,
  resolve: (incName: string, contextFqn: string) => string,
  resolveClass: (name: string, contextFqn: string) => string,
): Set<string> {
  const held = new Set<string>();
  const seen = new Set<string>([klassFqn]);
  for (
    let info: ClassInfo | undefined = klass, fqn = klassFqn;
    info?.superclass != null && info.delegateClass !== true;
  ) {
    fqn = resolveClass(info.superclass, fqn);
    if (seen.has(fqn)) break;
    seen.add(fqn);
    info = classes[fqn] as ClassInfo | undefined;
    if (info === undefined) break;
    const ancestors = moduleAncestors(info, fqn, modules, resolve);
    for (const mod of [...ancestors.prepended, ...ancestors.included]) held.add(mod);
  }
  return held;
}

/** The ancestors that define `hook` in the class's own Ruby file. */
export function sameFileInitializeModules(
  klass: ClassInfo,
  ancestors: ModuleAncestors,
  modules: Record<string, unknown>,
  hook = "initialize",
): string[] {
  return [...ancestors.prepended, ...ancestors.included].filter((fqn) => {
    const mod = modules[fqn] as ClassInfo | undefined;
    return (
      mod !== undefined &&
      klass.file !== undefined &&
      mod.file === klass.file &&
      mod.instanceMethods.some((m) => m.name === hook)
    );
  });
}

/**
 * The bodies a constructor's tags cite, in tag order. Throws on a tag naming a
 * module in `sameFile`: a same-file body joins the chain untagged, so the tag
 * is redundant.
 */
export function taggedBodies(
  ruby: ApiManifest,
  tags: readonly InlinedFrom[],
  sameFile: readonly string[],
  where: string,
): ModuleBody[] {
  return tags.map((tag) => {
    if (sameFile.includes(tag.module)) {
      throw new Error(
        `${TAG} is redundant: ${where} — \`${tag.module}\` is defined in the Ruby file this ` +
          "constructor's file mirrors, and a same-file body is inlined untagged.",
      );
    }
    return { module: tag.module, body: inlinedHookBody(ruby, tag, where) };
  });
}

/**
 * The tagged constructors the pairing pass never read, as `file Owner`. A tag
 * is checked only when its constructor's chain is built, so one on a
 * constructor the gate paired with no Rails `initialize` was checked by nothing.
 */
export function uncomparedInlinedTags(
  byFileOwner: ReadonlyMap<string, ReadonlyMap<string, unknown>>,
  compared: ReadonlySet<string>,
): string[] {
  return [...byFileOwner]
    .flatMap(([file, byOwner]) => [...byOwner.keys()].map((owner) => `${file} ${owner}`))
    .filter((key) => !compared.has(key))
    .sort();
}

/** The last segment of a Ruby `A::B` or TS `A.B` name. */
export function shortName(name: string): string {
  return name.split(/::|\./).pop()!;
}

/**
 * Whether `tsClass` is named after a Ruby class other than `rubyModule` in
 * `rubyModule`'s own `.rb`, so that it ports that sibling rather than
 * `rubyModule` (`Integration::Session` beside `IntegrationTest`).
 */
export function portsSiblingClass(
  tsClass: string,
  rubyModule: string,
  classes: Readonly<Record<string, ClassInfo>>,
): boolean {
  const file = classes[rubyModule]?.file;
  if (file === undefined || shortName(tsClass) === shortName(rubyModule)) return false;
  return Object.entries(classes).some(
    ([fqn, other]) =>
      fqn !== rubyModule && other.file === file && shortName(fqn) === shortName(tsClass),
  );
}

/**
 * The Rails chain a constructor that inlines module bodies answers to
 * (RFC 0188), in the order Ruby runs it: the class's own `self.new`, then a
 * tagged `ClassMethods#new`, both of which `Class#new` is entered through
 * before any `initialize`, then each prepended module's `initialize`, the
 * class's own, each included module's, and any tagged module outside
 * `ancestors` in tag order. Empty when the class has no `self.new`, no
 * same-file module and no tag, which leaves the pair to the ordinary gate.
 */
export function inlinedSegments(
  own: MethodInfo | undefined,
  ancestors: ModuleAncestors,
  sameFile: readonly ModuleBody[],
  tagged: readonly ModuleBody[],
  ownNew?: MethodInfo,
): MethodInfo[] {
  if (sameFile.length + tagged.length === 0 && ownNew === undefined) return [];
  const initializes = [...sameFile, ...tagged.filter((m) => m.body.name !== "new")];
  const at = (fqns: readonly string[]) =>
    fqns.flatMap((fqn) => initializes.filter((m) => m.module === fqn).map((m) => m.body));
  const placed = new Set([...ancestors.prepended, ...ancestors.included]);
  return [
    ...(ownNew === undefined ? [] : [ownNew]),
    ...tagged.filter((m) => m.body.name === "new").map((m) => m.body),
    ...at(ancestors.prepended),
    ...(own === undefined ? [] : [own]),
    ...at(ancestors.included),
    ...initializes.filter((m) => !placed.has(m.module)).map((m) => m.body),
  ];
}

/**
 * The Rails chain a method that inlines module `super` targets answers to
 * (RFC 0197): the includer's own `def`, when it has one, then each tagged
 * module method in tag order. Empty when the method carries no tag.
 */
export function inlinedMethodSegments(
  own: MethodInfo | undefined,
  tagged: readonly ModuleBody[],
): MethodInfo[] {
  if (tagged.length === 0) return [];
  return [...(own === undefined ? [] : [own]), ...tagged.map((m) => m.body)];
}

/** Where a constructor or method carrying a tag sits. */
export interface TaggedConstructor {
  package: string;
  tsFile: string;
  tsName: string;
}

/**
 * Every tagged constructor or method in the TS manifest, keyed by the
 * `Module#hook` it cites. Each tag is resolved through {@link inlinedHookBody} first, so one
 * that names no `def`, or cites it at a stale span, throws here and credits
 * nothing.
 */
export function inlinedHookTags(
  ts: ApiManifest,
  ruby: ApiManifest,
): Map<string, TaggedConstructor[]> {
  const byHook = new Map<string, TaggedConstructor[]>();
  for (const [name, pkg] of Object.entries(ts.packages)) {
    for (const [owner, klass] of Object.entries(pkg.classes) as unknown as [string, ClassInfo][]) {
      for (const member of klass.instanceMethods) {
        for (const tag of member.inlinedFrom ?? []) {
          const key = `${tag.module}#${tag.hook}`;
          const tsFile = member.file ?? klass.file;
          if (tsFile === undefined) continue;
          inlinedHookBody(ruby, tag, `${name}/${tsFile} ${owner}#${member.name}`);
          byHook.set(key, [
            ...(byHook.get(key) ?? []),
            { package: name, tsFile, tsName: member.name },
          ]);
        }
      }
    }
  }
  return byHook;
}

/**
 * The crediting rule for a module's hook (RFC 0188): a module `initialize`, a
 * `ClassMethods#new`, or a module method whose `super` an includer inlines
 * (RFC 0197), has no TS member of its own to pair with, and is matched when a
 * member carrying its tag sits in the mirror of a Rails file that includes,
 * prepends or extends the module. `includerFiles` are
 * those mirrors within the module's own package. The include graph is built
 * per package, so a constructor in another package is credited on its tag,
 * which {@link inlinedHookTags} has already resolved to the module's `def`.
 */
export function inlinedHookCreditedBy(
  module: string,
  hook: InlinedFrom["hook"],
  pkg: string,
  includerFiles: ReadonlySet<string>,
  tags: ReadonlyMap<string, readonly TaggedConstructor[]>,
): TaggedConstructor | undefined {
  return tags
    .get(`${module}#${hook}`)
    ?.find((tagged) => tagged.package !== pkg || includerFiles.has(tagged.tsFile));
}

/**
 * Whether a `self.new` names its block only to hand it on through a bare
 * `super` (`DeprecationProxy.new(*args, **kwargs, &block)`,
 * `deprecation/proxy_wrappers.rb:6-11`). `Class#new` passes that block to
 * `initialize`, so whether the constructor takes one is `initialize`'s
 * signature to say, and the `new` row has no block of its own to compare.
 */
export function blockRidesZsuper(rubyNew: MethodInfo): boolean {
  const block = rubyNew.params.find((param) => param.kind === "block")?.name;
  const sites = rubyNew.callArgs ?? [];
  return (
    block !== undefined &&
    sites.some((site) => site.name === "super" && site.flags.includes("zsuper")) &&
    !sites.some(
      (site) =>
        site.name === "yield" ||
        site.flags.includes("blockpass") ||
        site.recv === `id:${block}` ||
        site.args.includes(`id:${block}`),
    )
  );
}

const consumesSuper = (segments: readonly MethodInfo[], index: number): boolean =>
  index < segments.length - 1;

/**
 * The union call set of a chain, in Ruby's evaluation order. A segment's
 * `super` is the call into the next segment, which the inlining spends, so the
 * next segment's calls stand at its position and only the last segment's
 * `super` is kept. A segment that names no `super` is followed by the rest.
 */
export function inlinedRubyBody(segments: readonly MethodInfo[]): RubyBody {
  const calls = new Set<string>();
  const strong = new Set<string>();
  const receivers: Record<string, string[]> = {};
  const receiverNames: Record<string, string[]> = {};
  const stringEvals: string[] = [];
  const merge = (into: Record<string, string[]>, from: Record<string, string[]> | undefined) => {
    for (const [call, values] of Object.entries(from ?? {})) {
      into[call] = [...new Set([...(into[call] ?? []), ...values])].sort();
    }
  };
  const ordered = (index: number): string[] => {
    if (index >= segments.length) return [];
    const own = segments[index].calls ?? [];
    const at = consumesSuper(segments, index) ? own.indexOf("super") : -1;
    return at === -1
      ? [...own, ...ordered(index + 1)]
      : [...own.slice(0, at), ...ordered(index + 1), ...own.slice(at + 1)];
  };
  for (const call of ordered(0)) calls.add(call);
  segments.forEach((segment, index) => {
    const weak = new Set(segment.weakCalls ?? []);
    for (const call of segment.calls ?? []) {
      if (call === "super" && consumesSuper(segments, index)) continue;
      if (!weak.has(call)) strong.add(call);
    }
    merge(receivers, segment.callReceivers);
    merge(receiverNames, segment.callReceiverNames);
    stringEvals.push(...(segment.stringEvalCalls ?? []));
  });
  return {
    calls: [...calls],
    weak: [...calls].filter((call) => !strong.has(call)),
    receivers,
    receiverNames,
    stringEvals,
  };
}

/** The call sites of a chain, in chain order, with each consumed `super` dropped. */
export function inlinedRubyCallArgs(segments: readonly MethodInfo[]): CallSite[] {
  return segments.flatMap((segment, index) =>
    (segment.callArgs ?? []).filter(
      (site) => !(site.name === "super" && consumesSuper(segments, index)),
    ),
  );
}

/**
 * The control + call skeleton of a chain, in chain order. A consumed `super`
 * leaves no token, as it leaves no call in {@link inlinedRubyBody}.
 */
export function inlinedRubySkeleton(segments: readonly MethodInfo[]): string[] {
  return segments.flatMap((segment, index) =>
    (segment.skeleton ?? []).filter(
      (token) => !(token === "ref:super" && consumesSuper(segments, index)),
    ),
  );
}

/**
 * Whether a Rails class defines no `initialize` of its own, and its
 * constructor is tagged and not yet compared. The ordinary pairing has no
 * `initialize` row of the class's own to read, so its Rails bodies are the
 * ones its tags cite: from another package (`I18n::Config`), or through an
 * `include` whose row the pairing credits without reading a body
 * (`ActionController::API`). Asked one class at a time, and after the ordinary
 * pairing, so a class already compared is refused.
 */
export function isInitializeLessTaggedClass(
  fqn: string,
  classes: Record<string, unknown>,
  definingInitialize: ReadonlySet<string>,
  tagged: ReadonlyMap<string, unknown> | undefined,
  compared: ReadonlySet<string>,
  tsFile: string,
  tsOwnerOf: (fqn: string) => string | undefined,
): boolean {
  if (tagged === undefined) return false;
  if (!Object.hasOwn(classes, fqn) || definingInitialize.has(fqn)) return false;
  const owner = tsOwnerOf(fqn);
  return owner !== undefined && tagged.has(owner) && !compared.has(`${tsFile} ${owner}`);
}
