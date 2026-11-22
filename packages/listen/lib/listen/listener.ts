import { subscribe, type AsyncSubscription, type Event } from "@parcel/watcher";
import { ArgumentError, File, rbBlockGivenP, rbInspect, Thread } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export interface ListenerOptions {
  debug?: boolean;
  waitForDelay?: number | null;
  relative?: boolean;
  forcePolling?: boolean;
  pollingFallbackMessage?: string | null;
  latency?: number;
  ignore?: RegExp | RegExp[];
  ignoreBang?: RegExp | RegExp[];
  only?: RegExp | RegExp[];
}

/** @noRailsEquivalent PERMANENT */
export type ListenerBlock = (modified: string[], added: string[], removed: string[]) => unknown;

type State = "initializing" | "backendStarted" | "processingEvents" | "paused" | "stopped";

const STATES: Record<State, State[]> = {
  initializing: ["backendStarted", "stopped"],
  backendStarted: ["processingEvents", "stopped"],
  processingEvents: ["paused", "stopped"],
  paused: ["processingEvents", "stopped"],
  stopped: ["backendStarted"],
};

const DEFAULTS: ListenerOptions = {
  debug: false,
  waitForDelay: null,
  relative: false,
  forcePolling: false,
  pollingFallbackMessage: null,
};

const WAIT_FOR_DELAY = 0.1;

const DEFAULT_IGNORED_FILES =
  /^(?:\.git|\.svn|\.hg|\.rbx|\.bundle|bundle|vendor\/bundle|log|tmp|vendor\/ruby|#.+#|\.#.+)(\/|$)/;

const DEFAULT_IGNORED_EXTENSIONS =
  /(?:\..*\d+\.new|\.kate-swp|\.goutputstream-.{6}|___jb_bak___|___jb_old___|\.sw[px]|\.swpx|^4913|(?:^sed(?:[A-Z][a-zA-Z0-9]{5}|[a-zA-Z0-9][A-Z][a-zA-Z0-9]{4}|[a-zA-Z0-9]{2}[A-Z][a-zA-Z0-9]{3}|[a-zA-Z0-9]{3}[A-Z][a-zA-Z0-9]{2}|[a-zA-Z0-9]{4}[A-Z][a-zA-Z0-9]|[a-zA-Z0-9]{5}[A-Z]))|\.mutagen-temporary.*|\.DS_Store|\.tmp|~)$/;

type Action = "modified" | "added" | "removed";

const ACTIONS: Record<Event["type"], Action> = {
  update: "modified",
  create: "added",
  delete: "removed",
};

export class Listener {
  /** @internal */
  _dirs: string[];
  /** @internal */
  _options: ListenerOptions;
  /** @internal */
  _block: ListenerBlock | null;
  /** @internal */
  _state: State = "initializing";
  /** @internal */
  _subscriptions: AsyncSubscription[] = [];
  /** @internal */
  _changes: [Action, string][] = [];
  /** @internal */
  _onlyPatterns: RegExp[] | null = null;
  /** @internal */
  _ignorePatterns: RegExp[] = [];
  /** @internal */
  _prevSilencerOptions: ListenerOptions = {};
  /** @internal */
  _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(...dirs: (string | ListenerOptions | ListenerBlock)[]) {
    const block = rbBlockGivenP(dirs.at(-1)) ? (dirs.pop() as ListenerBlock) : null;
    const last = dirs.at(-1);
    const options = last != null && typeof last === "object" ? (dirs.pop() as ListenerOptions) : {};

    this._options = { ...DEFAULTS, ...options };
    for (const key of Object.keys(options)) {
      if (!["latency", "ignore", "ignoreBang", "only"].includes(key) && !(key in DEFAULTS)) {
        throw new ArgumentError(
          `Unknown options: ${rbInspect({ [key]: options[key as keyof ListenerOptions] })}`,
        );
      }
    }
    this._dirs = dirs as string[];
    this._block = block;
    const rules: ListenerOptions = {};
    for (const option of ["only", "ignore", "ignoreBang"] as const) {
      if (option in this._options) rules[option] = this._options[option];
    }
    this._reconfigureSilencer(rules);
  }

  async start(): Promise<void> {
    switch (this._state) {
      case "initializing":
        await this._transition("backendStarted");
        await this._transition("processingEvents");
        break;
      case "paused":
        await this._transition("processingEvents");
        break;
      default:
        throw new ArgumentError(`cannot start from state ${rbInspect(`:${this._state}`)}`);
    }
  }

  async stop(): Promise<void> {
    await this._transition("stopped");
  }

  async pause(): Promise<void> {
    await this._transition("paused");
  }

  isProcessing(): boolean {
    return this._state === "processingEvents";
  }

  isPaused(): boolean {
    return this._state === "paused";
  }

  isStopped(): boolean {
    return this._state === "stopped";
  }

  ignore(regexps: RegExp | RegExp[]): void {
    const prevIgnores = [this._prevSilencerOptions.ignore ?? []].flat();
    this._reconfigureSilencer({ ignore: [...prevIgnores, regexps].flat() });
  }

  ignoreBang(regexps: RegExp | RegExp[]): void {
    this._reconfigureSilencer({ ignoreBang: regexps });
  }

  only(regexps: RegExp | RegExp[]): void {
    this._reconfigureSilencer({ only: regexps });
  }

  /** @internal */
  async _transition(newState: State): Promise<void> {
    if (!STATES[this._state].includes(newState)) {
      throw new ArgumentError(
        `can't transition from ${rbInspect(`:${this._state}`)} to ${rbInspect(`:${newState}`)}`,
      );
    }
    this._state = newState;
    switch (newState) {
      case "backendStarted":
        await this._startBackend();
        break;
      case "processingEvents":
        if (this._changes.length > 0) this._scheduleProcessChanges();
        break;
      case "stopped":
        await this._stopBackend();
        if (this._timer != null) clearTimeout(this._timer);
        this._timer = null;
        this._changes = [];
        break;
    }
  }

  /** @internal */
  async _startBackend(): Promise<void> {
    for (const dir of this._dirs) {
      const root = await File.realpathAsync(dir);
      const subscription = await subscribe(root, (err, events) => {
        if (err != null) throw err;
        this._queueChanges(root, events);
      });
      this._subscriptions.push(subscription);
    }
  }

  /** @internal */
  async _stopBackend(): Promise<void> {
    const subscriptions = this._subscriptions;
    this._subscriptions = [];
    await Promise.all(subscriptions.map((s) => s.unsubscribe()));
  }

  /** @internal */
  _queueChanges(root: string, events: Event[]): void {
    if (this._state === "stopped") return;
    for (const event of events) {
      const relativePath = event.path.slice(root.length + 1);
      if (this._isSilenced(relativePath)) continue;
      const path = this._options.relative ? relativePath : event.path;
      this._changes.push([ACTIONS[event.type], path]);
    }
    if (this._state === "processingEvents") this._scheduleProcessChanges();
  }

  /** @internal */
  _scheduleProcessChanges(): void {
    if (this._timer != null || this._changes.length === 0) return;
    const latency = this._options.waitForDelay ?? this._options.latency ?? WAIT_FOR_DELAY;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._state !== "processingEvents") return;
      new Thread(() => this._processChanges());
    }, latency * 1000);
  }

  /** @internal */
  async _processChanges(): Promise<void> {
    const changes = this._changes;
    this._changes = [];

    if (this._block == null) return;

    const hash = this._squashChanges(changes);
    const result: [string[], string[], string[]] = [hash.modified, hash.added, hash.removed];
    if (result.every((a) => a.length === 0)) return;

    await this._block(...result);
  }

  /** @internal */
  _squashChanges(changes: [Action, string][]): Record<Action, string[]> {
    const actions = new Map<string, Action[]>();
    for (const [change, path] of changes) {
      const list = actions.get(path);
      if (list) list.push(change);
      else actions.set(path, [change]);
    }
    const squashed: Record<Action, string[]> = { modified: [], added: [], removed: [] };
    for (const [path, actionList] of actions) {
      const type = this._logicalActionFor(actionList);
      if (type != null) squashed[type].push(path);
    }
    return squashed;
  }

  /** @internal */
  _logicalActionFor(actions: Action[]): Action | null {
    const modified = actions.find((x) => x === "modified") ?? null;
    const added = actions.filter((x) => x === "added").length;
    const removed = actions.filter((x) => x === "removed").length;
    const diff = added - removed;

    if (actions.at(-1) !== "removed") {
      if (diff > 0) {
        return "added";
      } else if (diff === 0 && added > 0) {
        return "modified";
      } else {
        return modified;
      }
    } else {
      return diff < 0 ? "removed" : null;
    }
  }

  /** @internal */
  _isSilenced(path: string): boolean {
    return (
      this._ignorePatterns.some((pattern) => pattern.test(path)) ||
      (this._onlyPatterns != null && !this._onlyPatterns.some((pattern) => pattern.test(path)))
    );
  }

  /** @internal */
  _reconfigureSilencer(extraOptions: ListenerOptions): void {
    const opts: ListenerOptions = {};
    for (const [key, value] of Object.entries(extraOptions)) {
      opts[key as "ignore"] = [value as RegExp[]].flat().filter((x) => x != null);
    }
    if ("ignore" in opts && (opts.ignore as RegExp[]).length === 0) delete opts.ignore;
    this._prevSilencerOptions = opts;

    this._onlyPatterns = opts.only != null ? [opts.only].flat() : null;
    const patterns: RegExp[] = [];
    if (opts.ignoreBang == null) {
      patterns.push(DEFAULT_IGNORED_FILES, DEFAULT_IGNORED_EXTENSIONS);
    }
    this._ignorePatterns = [...patterns, opts.ignore ?? [], opts.ignoreBang ?? []].flat();
  }
}
