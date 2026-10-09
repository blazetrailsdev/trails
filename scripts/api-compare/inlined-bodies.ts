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
 * Throws, naming `where` the tag sits, when the manifest holds no such `def`
 * or the tag's citation is not exactly that `def`'s path and line span.
 */
export function inlinedHookBody(ruby: ApiManifest, tag: InlinedFrom, where: string): MethodInfo {
  const name = `${tag.module}#${tag.hook}`;
  for (const pkg of Object.values(ruby.packages)) {
    const mod = pkg.modules[tag.module] as unknown as ClassInfo | undefined;
    const body = mod?.instanceMethods.find((m) => m.name === tag.hook);
    if (!body) continue;
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

/**
 * The modules a class includes that define `initialize` in the class's own
 * Ruby file, as FQNs in ancestor order: the last `include` first, each
 * followed by the modules it includes itself.
 */
export function sameFileInitializeModules(
  klass: ClassInfo,
  klassFqn: string,
  modules: Record<string, unknown>,
  resolve: (incName: string, contextFqn: string) => string,
): string[] {
  const found: string[] = [];
  const visited = new Set<string>();
  const walk = (includes: readonly string[] | undefined, contextFqn: string): void => {
    for (const inc of [...(includes ?? [])].reverse()) {
      const fqn = resolve(inc, contextFqn);
      if (visited.has(fqn)) continue;
      visited.add(fqn);
      const mod = modules[fqn] as ClassInfo | undefined;
      if (!mod) continue;
      if (
        klass.file !== undefined &&
        mod.file === klass.file &&
        mod.instanceMethods.some((m) => m.name === "initialize")
      ) {
        found.push(fqn);
      }
      walk(mod.includes, fqn);
    }
  };
  walk(klass.includes, klassFqn);
  return found;
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
): MethodInfo[] {
  return tags.map((tag) => {
    if (sameFile.includes(tag.module)) {
      throw new Error(
        `${TAG} is redundant: ${where} — \`${tag.module}\` is defined in the Ruby file this ` +
          "constructor's file mirrors, and a same-file body is inlined untagged.",
      );
    }
    return inlinedHookBody(ruby, tag, where);
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
 * (RFC 0188), in the order Ruby runs it: a tagged `ClassMethods#new`, which
 * `Class#new` enters before any `initialize`, then the class's own
 * `initialize`, its same-file modules', and the tagged `initialize` bodies in
 * tag order. Empty when the class has neither a same-file module nor a tag,
 * which leaves the pair to the ordinary gate.
 */
export function inlinedSegments(
  own: MethodInfo | undefined,
  sameFile: readonly MethodInfo[],
  tagged: readonly MethodInfo[],
): MethodInfo[] {
  if (sameFile.length + tagged.length === 0) return [];
  return [
    ...tagged.filter((m) => m.name === "new"),
    ...(own === undefined ? [] : [own]),
    ...sameFile,
    ...tagged.filter((m) => m.name !== "new"),
  ];
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
