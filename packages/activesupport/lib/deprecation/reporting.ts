import { classModule } from "@blazetrails/ruby-compat";
import type { ThreadLocalVar } from "../thread-local-var.js";
import type { AllowMatcher, Disallowed } from "./disallowed.js";
import type { Behavior } from "./behaviors.js";

/** @noRailsEquivalent PERMANENT */
export interface CallerLocation {
  path: string;
  absolutePath?: string;
  lineno: number;
  label: string;
  callSite?: CallSite;
  toString(): string;
}

/** @noRailsEquivalent PERMANENT */
export interface CallSite {
  isEval(): boolean;
  getLineNumber(): number | null;
  getScriptNameOrSourceURL(): string | null | undefined;
}

/** @noRailsEquivalent PERMANENT */
export function callerLocations(start = 1, length?: number): CallerLocation[] {
  let sites: CallSite[] = [];
  const prepareStackTrace = Error.prepareStackTrace;
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = length == null ? Infinity : 2 + start + length;
  Error.prepareStackTrace = (error, callSites) => {
    sites = callSites;
    return prepareStackTrace
      ? prepareStackTrace(error, callSites)
      : [String(error), ...callSites.map((site) => `    at ${site}`)].join("\n");
  };
  let stack: string | undefined;
  try {
    stack = new Error().stack;
  } finally {
    Error.prepareStackTrace = prepareStackTrace;
    Error.stackTraceLimit = stackTraceLimit;
  }
  if (stack == null) return callerLocationsViaCallSites(start, length);
  const locations = stack
    .split("\n")
    .slice(2 + start)
    .flatMap((line, i) => {
      const m = /\((.*):(\d+):\d+\)$|at (.*):(\d+):\d+$/.exec(line.trim());
      if (!m) return [];
      const raw = m[1] ?? m[3];
      const path = raw.startsWith("file://")
        ? decodeURIComponent(raw.slice("file://".length))
        : raw;
      const callSite = sites[1 + start + i];
      const absolutePath = callSite?.isEval() ? undefined : path;
      const lineno = Number(m[2] ?? m[4]);
      const label = /at ([^ (]+)/.exec(line.trim())?.[1] ?? "";
      return [
        {
          path,
          absolutePath,
          lineno,
          label,
          callSite,
          toString: () => `${path}:${lineno}:in '${label}'`,
        },
      ];
    });
  if (locations.length === 0) return callerLocationsViaCallSites(start, length);
  return length == null ? locations : locations.slice(0, length);
}

function callerLocationsViaCallSites(start: number, length?: number): CallerLocation[] {
  const nodeUtil = (
    globalThis as {
      process?: { getBuiltinModule?: (id: string) => unknown };
    }
  ).process?.getBuiltinModule?.("node:util") as
    | { getCallSites?: (frameCount?: number) => NodeCallSite[] }
    | undefined;
  const getCallSites = nodeUtil?.getCallSites;
  if (typeof getCallSites !== "function") return [];
  let sites: NodeCallSite[];
  try {
    sites = getCallSites(length == null ? 200 : 2 + start + length);
  } catch {
    return [];
  }
  if (!Array.isArray(sites)) return [];
  const locations = sites.slice(2 + start).map((site) => {
    const raw = typeof site?.scriptName === "string" ? site.scriptName : "";
    const path = raw.startsWith("file://") ? decodeURIComponent(raw.slice("file://".length)) : raw;
    const lineno = Number.isFinite(site?.lineNumber) ? Number(site.lineNumber) : 0;
    const label = typeof site?.functionName === "string" ? site.functionName : "";
    return {
      path,
      absolutePath: path === "" ? undefined : path,
      lineno,
      label,
      toString: () => `${path}:${lineno}:in '${label}'`,
    };
  });
  return length == null ? locations : locations.slice(0, length);
}

interface NodeCallSite {
  functionName?: string;
  scriptName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

const TRAILS_GEM_ROOT = new URL("../", import.meta.url).pathname;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Reporting {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  get gemName(): string {
    return this._gemName;
  }

  set gemName(gemName: string) {
    this._gemName = gemName;
  }

  warn(message?: string, callstack?: CallerLocation[]): string | undefined {
    if (this.silenced) return;

    callstack ??= callerLocations(2);
    const fullMessage = this.deprecationMessage(callstack, message);
    if (this.isDeprecationDisallowed(message)) {
      for (const b of this.disallowedBehavior) b(fullMessage, callstack, this);
    } else {
      for (const b of this.behavior) b(fullMessage, callstack, this);
    }
    return fullMessage;
  }

  deprecationWarning(
    deprecatedMethodName: string,
    message: string | null = null,
    callerBacktrace?: CallerLocation[],
  ): string {
    callerBacktrace ??= callerLocations(2);
    const msg = this.deprecatedMethodWarning(deprecatedMethodName, message);
    this.warn(msg, callerBacktrace);
    return msg;
  }

  /** @internal */
  deprecatedMethodWarning(methodName: string, message: string | null = null): string {
    const warning = `${methodName} is deprecated and will be removed from ${this.gemName} ${this.deprecationHorizon}`;
    if (message == null) return warning;
    if (message.startsWith(":")) return `${warning} (use ${message.slice(1)} instead)`;
    return `${warning} (${message})`;
  }

  /** @internal */
  deprecationMessage(callstack: CallerLocation[], message?: string): string {
    message ??=
      "You are using deprecated behavior which will be removed from the next major or minor release.";
    return `DEPRECATION WARNING: ${message} ${this.deprecationCallerMessage(callstack) ?? ""}`;
  }

  /** @internal */
  deprecationCallerMessage(callstack: CallerLocation[]): string | undefined {
    const [file, line, method] = this.extractCallstack(callstack);
    if (file != null) {
      if (line != null && method != null) {
        return `(called from ${method} at ${file}:${line})`;
      } else {
        return `(called from ${file}:${line})`;
      }
    }
  }

  /** @internal */
  extractCallstack(callstack: CallerLocation[]): [string, number, string] | [] {
    if (callstack.length === 0) return [];

    const offendingLine =
      callstack.find((frame) => {
        const path = frame.absolutePath ?? frame.path;
        return path != null && !this.isIgnoredCallstack(path);
      }) ?? callstack[0];

    return [offendingLine.path, offendingLine.lineno, offendingLine.label];
  }

  /** @internal */
  isIgnoredCallstack(path: string): boolean {
    return (
      path.startsWith(TRAILS_GEM_ROOT) || path.startsWith("node:") || path.includes("<internal:")
    );
  }

  silence<T>(block: () => T): T {
    this.beginSilence();
    let result: unknown;
    try {
      result = block();
    } catch (error) {
      this.endSilence();
      throw error;
    }
    if (result != null && typeof (result as { then?: unknown }).then === "function") {
      return Promise.resolve(result).finally(() => this.endSilence()) as T;
    }
    this.endSilence();
    return result as T;
  }

  beginSilence(): void {
    this._silenceCounter.value += 1;
  }

  endSilence(): void {
    this._silenceCounter.value -= 1;
  }

  allow<T>(
    allowedWarnings: AllowMatcher[] | ":all" = ":all",
    options: { if?: unknown } = {},
    block: () => T,
  ): T {
    let conditional = "if" in options ? options.if : true;
    if (typeof conditional === "function") conditional = (conditional as () => unknown)();
    if (conditional != null && conditional !== false) {
      return this._explicitlyAllowedWarnings.bind(allowedWarnings, block);
    } else {
      return block();
    }
  }

  get silenced(): boolean {
    return this._silenced || this._silenceCounter.value !== 0;
  }

  set silenced(silenced: boolean) {
    this._silenced = silenced;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Reporting extends Behavior, Disallowed {
  deprecationHorizon: string;
  /** @internal */
  _gemName: string;
  /** @internal */
  _silenced: boolean;
  /** @internal */
  _silenceCounter: ThreadLocalVar<number>;
}
