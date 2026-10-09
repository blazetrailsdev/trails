import type {
  ApiManifest,
  CallSite,
  ClassInfo,
  InlinedFrom,
  MethodInfo,
} from "@blazetrails/parity/types";

/** The Ruby call-set facts of one body, as compare.ts's call gate reads them. */
export interface RubyBody {
  calls: string[];
  weak: string[];
  receivers: Record<string, string[]>;
  receiverNames: Record<string, string[]>;
  stringEvals: string[];
}

/** The `def` a tag cites, from whichever package's manifest defines the module. */
export function inlinedHookBody(
  ruby: ApiManifest,
  tag: Pick<InlinedFrom, "module" | "hook">,
): MethodInfo | undefined {
  for (const pkg of Object.values(ruby.packages)) {
    const mod = pkg.modules[tag.module] as unknown as ClassInfo | undefined;
    const body = mod?.instanceMethods.find((m) => m.name === tag.hook);
    if (body) return body;
  }
  return undefined;
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
 * The Rails chain a constructor that inlines module bodies answers to
 * (RFC 0188): the class's own `initialize`, then its same-file modules', then
 * the bodies its `@inlinedFrom` tags name. Empty when the class has neither a
 * same-file module nor a tag, which leaves the pair to the ordinary gate.
 */
export function inlinedSegments(
  own: MethodInfo | undefined,
  sameFile: readonly (MethodInfo | undefined)[],
  tagged: readonly (MethodInfo | undefined)[],
): MethodInfo[] {
  const inlined = [...sameFile, ...tagged].filter((m) => m !== undefined);
  if (inlined.length === 0) return [];
  return own === undefined ? inlined : [own, ...inlined];
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
