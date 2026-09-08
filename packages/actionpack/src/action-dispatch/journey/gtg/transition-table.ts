import { include, ToJsonWithActiveSupportEncoder, type Included } from "@blazetrails/activesupport";
import { Base, Template, TseHandler } from "@blazetrails/actionview";
import { ArgumentError, File, getChildProcess, rbObjClass } from "@blazetrails/ruby-compat";
import { toDot, type DotHost, type DotTransition } from "../nfa/dot.js";
import { Symbol as SymbolNode, Terminal, type Node } from "../nodes/node.js";
import type { GtgState, TransitionTableLike } from "./simulator.js";

const __dir__ = new URL(".", import.meta.url).pathname;

export type Edge = string | RegExp;

const DEFAULT_EXP_SOURCE = SymbolNode.DEFAULT_EXP.source;
const DEFAULT_EXP_ANCHORED = new RegExp(`^${DEFAULT_EXP_SOURCE}$`);

function isDefaultExp(re: RegExp): boolean {
  return re.source === DEFAULT_EXP_SOURCE;
}

function anchorPreservingFlags(re: RegExp): RegExp {
  const flags = [...re.flags].filter((f) => "isd".includes(f));
  if (re.flags.includes("v")) flags.push("v");
  else if (re.flags.includes("u")) flags.push("u");
  return new RegExp(`^(?:${re.source})$`, flags.join(""));
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface TransitionTable {
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

  toDot = toDot;

  constructor() {}

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

  eclosure(t: number | readonly number[]): readonly number[] {
    return Array.isArray(t) ? t : [t as number];
  }

  move(t: GtgState, fullString: string, startIndex: number, endIndex: number): GtgState {
    if (t.length === 0) return [];
    const nextStates: Array<readonly [number, number | null]> = [];

    const tok = fullString.slice(startIndex, endIndex);
    const tokenMatchesDefaultComponent = DEFAULT_EXP_ANCHORED.test(tok);

    for (const [s, previousStart] of t) {
      let states: Map<RegExp, number> | Map<string, number> | undefined;
      if (previousStart === null) {
        if (tokenMatchesDefaultComponent && (states = this._stdparamStates.get(s))) {
          for (const [, v] of states) {
            if (v != null) nextStates.push([v, null] as const);
          }
        }

        if ((states = this._stringStates.get(s))) {
          if (states.get(tok) != null) nextStates.push([states.get(tok)!, null] as const);
        }
      }

      if ((states = this._regexpStates.get(s))) {
        let sliceStart;
        if (previousStart === null) {
          sliceStart = startIndex;
        } else {
          sliceStart = previousStart;
        }

        const sliceLength = endIndex - sliceStart;
        const currSlice = fullString.slice(sliceStart, sliceStart + sliceLength);

        for (const [re, v] of states) {
          if (v != null && re.test(currSlice)) nextStates.push([v, null] as const);
        }

        nextStates.push([s, sliceStart] as const);
      }
    }

    return nextStates;
  }

  set(from: number, to: number, sym: Edge): void {
    const statesHash = this.statesHashFor(sym);
    let toMappings = statesHash.get(from);
    if (!toMappings) {
      toMappings = new Map();
      statesHash.set(from, toMappings);
    }
    if (sym instanceof RegExp) {
      if (isDefaultExp(sym)) {
        sym = DEFAULT_EXP_ANCHORED;
      } else {
        sym = anchorPreservingFlags(sym);
      }
    }
    toMappings.set(sym, to);
  }

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

  asJson(): Record<string, unknown> {
    const stringStates: Record<number, Record<string, number>> = {};
    for (const [from, inner] of this._stringStates) {
      stringStates[from] = Object.fromEntries(inner);
    }
    const stdparamStates: Record<number, Record<string, number>> = {};
    for (const [from, inner] of this._stdparamStates) {
      stdparamStates[from] = Object.fromEntries([...inner].map(([re, v]) => [re.source, v]));
    }
    const regexpStates: Record<number, Record<string, number>> = {};
    for (const [from, inner] of this._regexpStates) {
      regexpStates[from] = Object.fromEntries([...inner].map(([re, v]) => [re.source, v]));
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

  toSvg(): string {
    let res;
    try {
      res = getChildProcess().spawnSync("dot", ["-Tsvg"], {
        input: this.toDot(),
        encoding: "utf8",
      });
    } catch {
      return "";
    }
    if (res.status !== 0 || typeof res.stdout !== "string") return "";
    const lines = res.stdout.split("\n");
    lines.splice(0, 3);
    return lines
      .join("\n")
      .replace(/width="[^"]*"/, "")
      .replace(/height="[^"]*"/, "");
  }

  /** @missingRailsArgs join — PERMANENT */
  visualizer(paths: readonly Node[], title = "FSM"): string {
    const vizDir = File.join(__dir__, "..", "visualizer");
    const fsmJs = File.read(File.join(vizDir, "fsm.js"));
    const fsmCss = File.read(File.join(vizDir, "fsm.css"));
    const tse = File.read(File.join(vizDir, "index.html.tse"));
    const states = `function tt() { return ${this.toJSON()}; }`;

    const funRoutes = sample(paths, 3).map((ast) => {
      const out: unknown[] = [];
      for (const n of ast) {
        if (n instanceof SymbolNode) {
          if (n.left === ":id") out.push(String(Math.floor(Math.random() * 100)));
          else if (n.left === ":format") out.push(sample(["xml", "json"], 1)[0]);
          else out.push("omg");
        } else if (n instanceof Terminal) {
          out.push(n.symbol);
        }
      }
      return out.join("");
    });

    const stylesheets = [fsmCss];
    const svg = this.toSvg();
    const javascripts = [states, fsmJs];

    const template = new Template({
      source: tse,
      identifier: File.join(vizDir, "index.html.tse"),
      handler: new TseHandler(),
      format: "html",
      locals: ["title", "funRoutes", "stylesheets", "svg", "javascripts", "paths"],
    });
    return template.render(Base.withEmptyTemplateCache().empty(), {
      title,
      funRoutes,
      stylesheets,
      svg,
      javascripts,
      paths,
    });
  }

  /** @internal */
  private statesHashFor(sym: Edge): Map<number, Map<Edge, number>> {
    if (typeof sym === "string") {
      return this._stringStates as Map<number, Map<Edge, number>>;
    } else if (sym instanceof RegExp) {
      if (isDefaultExp(sym)) {
        return this._stdparamStates as Map<number, Map<Edge, number>>;
      } else {
        return this._regexpStates as Map<number, Map<Edge, number>>;
      }
    } else {
      throw new ArgumentError(`unknown symbol: ${rbObjClass(sym)}`);
    }
  }
}

function sample<T>(xs: readonly T[], n: number): T[] {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

include(TransitionTable, ToJsonWithActiveSupportEncoder);
