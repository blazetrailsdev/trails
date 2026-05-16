import { toDot, type DotHost, type DotTransition } from "../nfa/dot.js";
import { Symbol as SymbolNode } from "../nodes/node.js";
import type { GtgState, TransitionTableLike } from "./simulator.js";

export type Edge = string | RegExp;

// Default segment regex — reuse the canonical Symbol.DEFAULT_EXP so this
// table and the parser stay in lockstep if the segment pattern ever shifts.
const DEFAULT_EXP_SOURCE = SymbolNode.DEFAULT_EXP.source;
const DEFAULT_EXP_ANCHORED = new RegExp(`^${DEFAULT_EXP_SOURCE}$`);

function isDefaultExp(re: RegExp): boolean {
  return re.source === DEFAULT_EXP_SOURCE;
}

/**
 * Anchor a per-symbol regex while preserving the original's flags (Rails'
 * `/\A#{sym}\Z/` interpolation wraps with inline flag scopes that we can't
 * emit in JS; the closest equivalent is hoisting flags to the outer regex).
 *
 * Wraps the source in `(?:…)` so anchoring binds around an alternation
 * (`/^foo|bar$/` parses as `(^foo)|(bar$)` — wrong).
 *
 * Filters:
 * - `g`/`y` are dropped — they change matching semantics in ways that
 *   break a single-shot anchored test.
 * - `m` is dropped — it changes `^`/`$` to match line boundaries, which
 *   would break the strict-string anchoring we want (Rails' `\A…\Z` is
 *   immune to `/m`).
 * - `u` and `v` are mutually exclusive; `v` supersedes.
 */
function anchorPreservingFlags(re: RegExp): RegExp {
  const flags = [...re.flags].filter((f) => "isd".includes(f));
  if (re.flags.includes("v")) flags.push("v");
  else if (re.flags.includes("u")) flags.push("u");
  return new RegExp(`^(?:${re.source})$`, flags.join(""));
}

/**
 * Generalized Transition table — the DFA produced by Builder. Implements the
 * `TransitionTableLike` shape that `Simulator` consumes. Mirrors Rails'
 * `ActionDispatch::Journey::GTG::TransitionTable`.
 */
export class TransitionTable implements TransitionTableLike, DotHost {
  /** @internal */
  private readonly _stdparamStates = new Map<number, Map<RegExp, number>>();
  /** @internal */
  private readonly _regexpStates = new Map<number, Map<RegExp, number>>();
  /** @internal */
  private readonly _stringStates = new Map<number, Map<string, number>>();
  /** @internal */
  private readonly _accepting = new Set<number>();

  readonly memos = new Map<number, unknown[]>();

  // Rails-style Dot mixin via assigned function (CLAUDE.md "this-typed function" pattern).
  toDot = toDot;

  addAccepting(state: number): void {
    this._accepting.add(state);
  }

  acceptingStates(): number[] {
    return [...this._accepting];
  }

  isAccepting(state: number): boolean {
    return this._accepting.has(state);
  }

  addMemo(idx: number, memo: unknown): void {
    let list = this.memos.get(idx);
    if (!list) {
      list = [];
      this.memos.set(idx, list);
    }
    list.push(memo);
  }

  memo(idx: number): readonly unknown[] {
    return this.memos.get(idx) ?? [];
  }

  /** Rails alias for the identity closure: just wraps a state. */
  eclosure(t: number | readonly number[]): readonly number[] {
    return Array.isArray(t) ? t : [t as number];
  }

  move(state: GtgState, fullString: string, startIndex: number, endIndex: number): GtgState {
    if (state.length === 0) return [];
    const nextStates: Array<readonly [number, number | null]> = [];

    const tok = fullString.slice(startIndex, endIndex);
    const tokenMatchesDefault = DEFAULT_EXP_ANCHORED.test(tok);

    for (const [s, previousStart] of state) {
      if (previousStart === null) {
        // Fast path for standard `:param` segments.
        if (tokenMatchesDefault) {
          const stds = this._stdparamStates.get(s);
          if (stds) {
            for (const [, v] of stds) {
              if (v != null) nextStates.push([v, null] as const);
            }
          }
        }
        // Literal string transitions.
        const strs = this._stringStates.get(s);
        if (strs && strs.has(tok)) {
          nextStates.push([strs.get(tok)!, null] as const);
        }
      }

      // Non-default regex transitions: a single token may not satisfy the
      // regex; carry forward with a wider slice on subsequent moves.
      const regs = this._regexpStates.get(s);
      if (regs) {
        const sliceStart = previousStart ?? startIndex;
        const curr = fullString.slice(sliceStart, endIndex);
        for (const [re, v] of regs) {
          if (v != null && re.test(curr)) nextStates.push([v, null] as const);
        }
        // Continue accepting tokens; remember slice origin for the next move.
        nextStates.push([s, sliceStart] as const);
      }
    }

    return nextStates;
  }

  set(from: number, to: number, sym: Edge): void {
    if (sym instanceof RegExp) {
      const map = this._regexpOrStdparam(sym);
      let inner = map.get(from);
      if (!inner) {
        inner = new Map();
        map.set(from, inner);
      }
      const anchored = isDefaultExp(sym) ? DEFAULT_EXP_ANCHORED : anchorPreservingFlags(sym);
      inner.set(anchored, to);
    } else {
      let inner = this._stringStates.get(from);
      if (!inner) {
        inner = new Map();
        this._stringStates.set(from, inner);
      }
      inner.set(sym, to);
    }
  }

  /** All unique state ids referenced by any transition map. */
  states(): readonly number[] {
    const seen = new Set<number>();
    const collect = (m: Map<number, Map<unknown, number>>) => {
      for (const [from, inner] of m) {
        seen.add(from);
        for (const v of inner.values()) seen.add(v);
      }
    };
    collect(this._stringStates as never);
    collect(this._stdparamStates as never);
    collect(this._regexpStates as never);
    return [...seen];
  }

  /** Yields [from, sym, to] triples — feeds NFA::Dot.to_dot. */
  transitions(): readonly DotTransition[] {
    const out: DotTransition[] = [];
    for (const [from, inner] of this._stringStates) {
      for (const [s, to] of inner) out.push([from, s, to] as const);
    }
    const regexLabel = (re: RegExp) => (re.flags ? `${re.source}/${re.flags}` : re.source);
    for (const [from, inner] of this._stdparamStates) {
      for (const [s, to] of inner) out.push([from, regexLabel(s), to] as const);
    }
    for (const [from, inner] of this._regexpStates) {
      for (const [s, to] of inner) out.push([from, regexLabel(s), to] as const);
    }
    return out;
  }

  /**
   * Rails `to_json` / `as_json` — emits a JSON-able snapshot of the table.
   * The accepting set is materialized as a `{state: true}` object to match
   * Ruby's Hash representation.
   */
  toJSON(): Record<string, unknown> {
    const stringStates: Record<number, Record<string, number>> = {};
    for (const [from, inner] of this._stringStates) {
      stringStates[from] = Object.fromEntries(inner);
    }
    // Encode flags in the key so two regex edges from the same state with the
    // same source but different flags don't collapse to one JSON entry.
    const regexKey = (re: RegExp) => (re.flags ? `${re.source}/${re.flags}` : re.source);
    const stdparamStates: Record<number, Record<string, number>> = {};
    for (const [from, inner] of this._stdparamStates) {
      stdparamStates[from] = Object.fromEntries([...inner].map(([re, v]) => [regexKey(re), v]));
    }
    const regexpStates: Record<number, Record<string, number>> = {};
    for (const [from, inner] of this._regexpStates) {
      regexpStates[from] = Object.fromEntries([...inner].map(([re, v]) => [regexKey(re), v]));
    }
    const accepting: Record<number, true> = {};
    for (const s of this._accepting) accepting[s] = true;
    return {
      regexp_states: regexpStates,
      string_states: stringStates,
      stdparam_states: stdparamStates,
      accepting,
    };
  }

  /** @internal */
  private _regexpOrStdparam(re: RegExp): Map<number, Map<RegExp, number>> {
    return isDefaultExp(re) ? this._stdparamStates : this._regexpStates;
  }

  // Rails ships `to_svg` (shells out to the `dot` binary) and
  // `visualizer` (renders an ERB template with an embedded JS visualizer).
  // Neither is ported: `to_svg` would require a graphviz dependency we
  // don't want to add, and `visualizer` depends on Rails-side ERB. Both
  // are debug-only and out of scope for the Wave 7 path-matching work.
}
