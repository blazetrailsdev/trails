import {
  AsyncEnumerable,
  cmp,
  extend,
  max,
  Monitor,
  rbCheckArrayType,
  rbCmpint,
  rbModName,
  rbObjRespondTo,
  stringSplit,
  strip,
} from "@blazetrails/ruby-compat";
import type { EarlyTime } from "./early-time.js";
import { InvocationChain } from "./invocation-chain.js";
import { InvocationExceptionMixin } from "./invocation-exception-mixin.js";
import type { LateTime } from "./late-time.js";
import { fromPathname, Rake } from "./rake-module.js";
import type { Scope } from "./scope.js";
import { EMPTY_TASK_ARGS, TaskArguments } from "./task-arguments.js";
import type { TaskManager } from "./task-manager.js";

export type Timestamp = Date | EarlyTime | LateTime;

export type TaskAction = (task: Task, args: TaskArguments, ...rest: unknown[]) => unknown;

export class Task {
  orderOnlyPrerequisites: string[];
  readonly actions: TaskAction[];
  application: TaskManager;
  readonly scope: Scope;
  readonly locations: string[];
  private _prerequisites: string[];
  private _alreadyInvoked: boolean;

  private _name: string;
  private _comments: string[];
  private _lock: Monitor;
  private _argNames: string[] | null;
  private _invocationException: unknown;
  declare private _sources?: string[];

  get prerequisites(): string[] {
    return this._prerequisites;
  }

  get alreadyInvoked(): boolean {
    return this._alreadyInvoked;
  }

  get prereqs(): string[] {
    return this.prerequisites;
  }

  toString(): string {
    return this.name;
  }

  inspect(): string {
    return `<${rbModName(this.constructor)} ${this.name} => [${this.prerequisites.join(", ")}]>`;
  }

  set sources(sources: string[]) {
    this._sources = sources;
  }

  get sources(): string[] {
    if (Object.hasOwn(this, "_sources")) {
      return this._sources!;
    } else {
      return this.prerequisites;
    }
  }

  async prerequisiteTasks(): Promise<Task[]> {
    return (await AsyncEnumerable.map.call(
      [...this.prerequisites, ...this.orderOnlyPrerequisites],
      (pre) => this.lookupPrerequisite(pre as string),
    )) as Task[];
  }

  /** @internal */
  private async lookupPrerequisite(prerequisiteName: string): Promise<Task> {
    const scopedPrerequisiteTask = await this.application.get(prerequisiteName, this.scope);
    let unscopedPrerequisiteTask: Task | null = null;
    if (scopedPrerequisiteTask === this) {
      unscopedPrerequisiteTask = await this.application.get(prerequisiteName);
    }
    return unscopedPrerequisiteTask || scopedPrerequisiteTask;
  }

  async allPrerequisiteTasks(): Promise<Task[]> {
    const seen: Record<string, Task> = {};
    await this.collectPrerequisites(seen);
    return Object.values(seen);
  }

  /** @internal */
  protected async collectPrerequisites(seen: Record<string, Task>): Promise<void> {
    for (const pre of await this.prerequisiteTasks()) {
      if (Object.hasOwn(seen, pre.name)) continue;
      seen[pre.name] = pre;
      await pre.collectPrerequisites(seen);
    }
  }

  get source(): string | null {
    return this.sources[0] ?? null;
  }

  constructor(taskName: string, app: TaskManager) {
    this._name = String(taskName);
    this._prerequisites = [];
    this.actions = [];
    this._alreadyInvoked = false;
    this._comments = [];
    this._lock = new Monitor();
    this.application = app;
    this.scope = app.currentScope;
    this._argNames = null;
    this.locations = [];
    this._invocationException = null;
    this.orderOnlyPrerequisites = [];
  }

  enhance(deps: string[] | null = null, block?: TaskAction): this {
    if (deps) this._prerequisites = [...new Set([...this.prerequisites, ...deps])];
    if (block) this.actions.push(block);
    return this;
  }

  get name(): string {
    return String(this._name);
  }

  nameWithArgs(): string {
    if (this.argDescription()) {
      return `${this.name}${this.argDescription()}`;
    } else {
      return this.name;
    }
  }

  argDescription(): string | null {
    return this._argNames ? `[${this.argNames.join(",")}]` : null;
  }

  get argNames(): string[] {
    return this._argNames || [];
  }

  reenable(): void {
    this._alreadyInvoked = false;
    this._invocationException = null;
  }

  clear(): this {
    this.clearPrerequisites();
    this.clearActions();
    this.clearComments();
    this.clearArgs();
    return this;
  }

  clearPrerequisites(): this {
    this.prerequisites.length = 0;
    return this;
  }

  clearActions(): this {
    this.actions.length = 0;
    return this;
  }

  clearComments(): this {
    this._comments = [];
    return this;
  }

  clearArgs(): this {
    this._argNames = null;
    return this;
  }

  async invoke(...args: unknown[]): Promise<void> {
    const taskArgs = new TaskArguments(this.argNames, args);
    await this.invokeWithCallChain(taskArgs, InvocationChain.EMPTY);
  }

  /** @internal */
  protected async invokeWithCallChain(
    taskArgs: TaskArguments,
    invocationChain: InvocationChain<Task>,
  ): Promise<void> {
    const newChain = InvocationChain.append<Task>(this, invocationChain);
    await this._lock.synchronize(async () => {
      try {
        if (this.application.options.trace) {
          this.application.trace(`** Invoke ${this.name} ${await this.formatTraceFlags()}`);
        }

        if (this.alreadyInvoked) {
          if (this._invocationException) {
            if (this.application.options.trace) {
              this.application.trace(
                `** Previous invocation of ${this.name} failed ${await this.formatTraceFlags()}`,
              );
            }
            throw this._invocationException;
          } else {
            return;
          }
        }

        this._alreadyInvoked = true;

        await this.invokePrerequisites(taskArgs, newChain);
        if (await this.isNeeded()) await this.execute(taskArgs);
      } catch (ex) {
        this.addChainTo(ex as object, newChain);
        this._invocationException = ex;
        throw ex;
      }
    });
  }

  /** @internal */
  private addChainTo(exception: object, newChain: InvocationChain<Task>): void {
    if (!rbObjRespondTo(exception, "chain")) extend(exception, InvocationExceptionMixin);
    const ex = exception as { chain: InvocationChain | null };
    if (ex.chain == null) ex.chain = newChain;
  }

  async invokePrerequisites(
    taskArgs: TaskArguments,
    invocationChain: InvocationChain<Task>,
  ): Promise<void> {
    if (this.application.options.alwaysMultitask) {
      await this.invokePrerequisitesConcurrently(taskArgs, invocationChain);
    } else {
      for (const p of await this.prerequisiteTasks()) {
        const prereqArgs = taskArgs.newScope(p.argNames);
        await p.invokeWithCallChain(prereqArgs, invocationChain);
      }
    }
  }

  /** @inventedArm allSettled — PERMANENT */
  async invokePrerequisitesConcurrently(
    taskArgs: TaskArguments,
    invocationChain: InvocationChain<Task>,
  ): Promise<void> {
    const futures = (await this.prerequisiteTasks()).map((p) => {
      const prereqArgs = taskArgs.newScope(p.argNames);
      const stats = this.application.threadPool;
      stats.totalThreadsInPlay += 1;
      stats.activeThreads += 1;
      stats.maxActiveThreads = Math.max(stats.maxActiveThreads, stats.activeThreads);
      return p.invokeWithCallChain(prereqArgs, invocationChain).finally(() => {
        stats.activeThreads -= 1;
      });
    });
    const values = await Promise.allSettled(futures);
    for (const value of values.reverse()) if (value.status === "rejected") throw value.reason;
  }

  /** @internal */
  private async formatTraceFlags(): Promise<string> {
    const flags: string[] = [];
    if (!this.alreadyInvoked) flags.push("first_time");
    if (!(await this.isNeeded())) flags.push("not_needed");
    return flags.length === 0 ? "" : "(" + flags.join(", ") + ")";
  }

  async execute(args: TaskArguments | null = null): Promise<void> {
    args ??= EMPTY_TASK_ARGS;
    if (this.application.options.dryrun) {
      this.application.trace(`** Execute (dry run) ${this.name}`);
      return;
    }
    if (this.application.options.trace) this.application.trace(`** Execute ${this.name}`);
    if (this.actions.length === 0) await this.application.enhanceWithMatchingRule(this.name);
    const opts = rbObjRespondTo(args, "toHash") ? args.toHash() : null;
    if (opts && Object.keys(opts).length !== 0) {
      for (const act of this.actions) await act(this, args, opts);
    } else {
      for (const act of this.actions) await act(this, args);
    }
  }

  async isNeeded(): Promise<boolean> {
    return true;
  }

  async timestamp(): Promise<Timestamp> {
    return new Date();
  }

  addDescription(description: string | null): void {
    if (!description) return;
    const comment = strip(description);
    if (comment && comment.length !== 0) this.addComment(comment);
  }

  set comment(comment: string | null) {
    this.addComment(comment);
  }

  /** @internal */
  private addComment(comment: string | null): void {
    if (comment == null) return;
    if (!this._comments.includes(comment)) this._comments.push(comment);
  }

  get fullComment(): string | null {
    return this.transformComments("\n");
  }

  get comment(): string | null {
    return this.transformComments(" / ", (c) => this.firstSentence(c));
  }

  /** @internal */
  private transformComments(
    separator: string,
    block?: (c: string) => string | null,
  ): string | null {
    if (this._comments.length === 0) {
      return null;
    } else {
      block ||= (c) => c;
      return this._comments.map(block).join(separator);
    }
  }

  /** @internal */
  private firstSentence(string: string): string | null {
    return stringSplit(string, /(?<=\w)(\.|!)[ \t]|(\.$|!)|\n/m)[0] ?? null;
  }

  setArgNames(args: string[]): string[] {
    return (this._argNames = args.map((a) => String(a)));
  }

  async investigation(): Promise<string> {
    let result = "------------------------------\n";
    result += `Investigating ${this.name}\n`;
    result += `class: ${rbModName(this.constructor)}\n`;
    result += `task needed: ${await this.isNeeded()}\n`;
    result += `timestamp: ${_timeToS(await this.timestamp())}\n`;
    result += "pre-requisites: \n";
    const prereqs = (await AsyncEnumerable.map.call(await this.prerequisiteTasks(), async (p) => [
      p,
      await (p as Task).timestamp(),
    ])) as [Task, Timestamp][];
    prereqs.sort((a, b) => rbCmpint(cmp(a[1], b[1]), a[1], b[1]));
    for (const [p, timestamp] of prereqs) {
      result += `--${p.name} (${_timeToS(timestamp)})\n`;
    }
    const latestPrereq = max(
      (await AsyncEnumerable.map.call(await this.prerequisiteTasks(), (p) =>
        (p as Task).timestamp(),
      )) as Timestamp[],
    );
    result += `latest-prerequisite time: ${latestPrereq ? _timeToS(latestPrereq) : ""}\n`;
    result += "................................\n\n";
    return result;
  }

  static formatDeps(deps: unknown): string[] {
    return (rbCheckArrayType(deps) ?? [deps]).map((d) => String(fromPathname(d)));
  }

  bitwiseOr(deps: unknown): this {
    const formatted = Task.formatDeps(deps).filter((d) => !this.prerequisites.includes(d));
    this.orderOnlyPrerequisites = [...new Set([...this.orderOnlyPrerequisites, ...formatted])];
    return this;
  }

  static clear(): void {
    Rake.application!.clear();
  }

  static get tasks(): Task[] {
    return Rake.application!.tasks;
  }

  static get(taskName: string): Promise<Task> {
    return Rake.application!.get(taskName);
  }

  static isTaskDefined(taskName: string): boolean {
    return Rake.application!.lookup(taskName) != null;
  }

  static defineTask(...args: unknown[]): Task {
    return Rake.application!.defineTask(this, ...args);
  }

  static createRule(...args: unknown[]): void {
    Rake.application!.createRule(...args);
  }

  static scopeName(scope: Scope, taskName: string): string {
    return scope.pathWithTaskName(taskName);
  }
}

/**
 * Ruby `Time#to_s` (`vendor/ruby/v3.3.11/time.c:4351` `time_to_s`), `%Y-%m-%d %H:%M:%S %z`
 * in local time; ruby-compat has no `Time`.
 *
 * @noRailsEquivalent PERMANENT
 */
function _timeToS(t: Timestamp): string {
  if (!(t instanceof Date)) return t.toString();
  const pad = (n: number, w = 2) => String(Math.trunc(Math.abs(n))).padStart(w, "0");
  const offset = -t.getTimezoneOffset();
  const zone = `${offset < 0 ? "-" : "+"}${pad(offset / 60)}${pad(offset % 60)}`;
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())} ${zone}`;
}
