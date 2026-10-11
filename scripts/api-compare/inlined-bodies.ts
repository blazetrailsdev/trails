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
          `manifest has it at ${actual}.`,
      );
    }
    return body;
  }
  throw new Error(`${TAG} names no Ruby body: ${where} — the manifest has no \`${name}\`.`);
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
 * The modules ahead of and behind a class in its ancestors, as FQNs: the last
 * `prepend` / `include` first, each module between its own prepends and includes.
 */
export function moduleAncestors(
  klass: ClassInfo,
  klassFqn: string,
  modules: Record<string, unknown>,
  resolve: (incName: string, contextFqn: string) => string,
): ModuleAncestors {
  const visited = new Set<string>();
  const walk = (names: readonly string[] | undefined, contextFqn: string, into: string[]): void => {
    for (const name of [...(names ?? [])].reverse()) {
      const fqn = resolve(name, contextFqn);
      if (visited.has(fqn)) continue;
      visited.add(fqn);
      const mod = modules[fqn] as ClassInfo | undefined;
      walk(mod?.prepends, fqn, into);
      into.push(fqn);
      walk(mod?.includes, fqn, into);
    }
  };
  const ancestors: ModuleAncestors = { prepended: [], included: [] };
  walk(klass.prepends, klassFqn, ancestors.prepended);
  walk(klass.includes, klassFqn, ancestors.included);
  return ancestors;
}

/** The ancestors that define `initialize` in the class's own Ruby file. */
export function sameFileInitializeModules(
  klass: ClassInfo,
  ancestors: ModuleAncestors,
  modules: Record<string, unknown>,
): string[] {
  return [...ancestors.prepended, ...ancestors.included].filter((fqn) => {
    const mod = modules[fqn] as ClassInfo | undefined;
    return (
      mod !== undefined &&
      klass.file !== undefined &&
      mod.file === klass.file &&
      mod.instanceMethods.some((m) => m.name === "initialize")
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

/** Where a constructor carrying a tag sits. */
export interface TaggedConstructor {
  package: string;
  tsFile: string;
}

/**
 * Every tagged constructor in the TS manifest, keyed by the `Module#hook` it
 * cites. Each tag is resolved through {@link inlinedHookBody} first, so one
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
        if (member.name !== "constructor") continue;
        for (const tag of member.inlinedFrom ?? []) {
          const key = `${tag.module}#${tag.hook}`;
          const tsFile = member.file ?? klass.file;
          if (tsFile === undefined) continue;
          inlinedHookBody(ruby, tag, `${name}/${tsFile} ${owner}#constructor`);
          byHook.set(key, [...(byHook.get(key) ?? []), { package: name, tsFile }]);
        }
      }
    }
  }
  return byHook;
}

/**
 * The crediting rule for a module's hook (RFC 0188): a module `initialize`, or
 * a `ClassMethods#new`, has no TS member of its own to pair with, and is
 * matched when a constructor carrying its tag sits in the mirror of a Rails
 * file that includes, prepends or extends the module. `includerFiles` are
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
 * The union call set of a chain. A segment's `super` is the call into the next
 * segment, which the inlining spends, so only the last segment's is kept.
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
  segments.forEach((segment, index) => {
    const weak = new Set(segment.weakCalls ?? []);
    for (const call of segment.calls ?? []) {
      if (call === "super" && consumesSuper(segments, index)) continue;
      calls.add(call);
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
 * Whether a Rails class reaches no `initialize` of its own or through a
 * same-package `include`, and its constructor is tagged and not yet compared.
 * The ordinary pairing has no `initialize` row for such a class, so its only
 * Rails body is the one a tag cites from another package. Asked one class at a
 * time, so a class the previous answer just had compared is refused.
 */
export function isInitializeLessTaggedClass(
  fqn: string,
  classes: Record<string, unknown>,
  reachingInitialize: ReadonlySet<string>,
  tagged: ReadonlyMap<string, unknown> | undefined,
  compared: ReadonlySet<string>,
  tsFile: string,
  tsOwnerOf: (fqn: string) => string | undefined,
): boolean {
  if (tagged === undefined) return false;
  if (!Object.hasOwn(classes, fqn) || reachingInitialize.has(fqn)) return false;
  const owner = tsOwnerOf(fqn);
  return owner !== undefined && tagged.has(owner) && !compared.has(`${tsFile} ${owner}`);
}
