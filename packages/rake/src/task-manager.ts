import {
  File,
  Method,
  RuntimeError,
  classModule,
  flatten,
  isPlainHash,
  rbCheckArrayType,
  rtest,
  rbBlockGivenP,
  rbClassInheritedP,
  rbFCaller,
  rbInspect,
  rbProcCall,
  rbStrSub,
  regexpEscape,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { toA } from "@blazetrails/ruby-compat/enumerable";
import { ext as stringExt, pathmap } from "./ext/string.js";
import { FileTask } from "./file-task.js";
import { NameSpace } from "./name-space.js";
import { Rake } from "./rake-module.js";
import { RuleRecursionOverflowError } from "./rule-recursion-overflow-error.js";
import { Scope } from "./scope.js";
import { Task, type TaskAction, type TaskApplication } from "./task.js";

type Rule = [RegExp | null, string[], unknown[], unknown, TaskAction | undefined];
type ResolvedArgs = [unknown, string[], unknown[], unknown];

export class TaskManager {
  static readonly [classModule] = true;
  static recordTaskMetadata = false;

  declare lastDescription: string | null;
  declare _tasks: Map<string, Task>;
  declare _rules: Rule[];
  declare _scope: Scope;
  declare _seed: number | undefined;
  declare options: TaskApplication["options"] & {
    traceOutput?: { puts(...strings: string[]): unknown };
  };
  declare trace: TaskApplication["trace"];

  createRule(...args: unknown[]): void {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as TaskAction) : undefined;
    const [resolvedPattern, resolvedArgs, deps, orderOnly] = this.resolveArgs(args);
    let pattern = resolvedPattern as RegExp | string | null;
    if (typeof pattern === "string") pattern = new RegExp(regexpEscape(pattern) + "$", "m");
    this._rules.push([pattern, resolvedArgs, deps, orderOnly, block]);
  }

  defineTask(taskClass: typeof Task, ...args: unknown[]): Task {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as TaskAction) : undefined;
    const resolved = this.resolveArgs(args);
    let taskName = resolved[0] as string;
    const [, argNames, deps, orderOnly] = resolved;

    const originalScope = this._scope;
    try {
      if (typeof taskName === "string" && !rbClassInheritedP(taskClass, FileTask)) {
        const definitionScope = stringSplit(taskName, ":").reverse();
        taskName = definitionScope.shift()!;
        this._scope = Scope.make(...definitionScope, ...toA(this._scope)) as Scope;
      }

      taskName = taskClass.scopeName(this._scope, taskName);
      const task = this.intern(taskClass, taskName);
      if (argNames.length !== 0) task.setArgNames(argNames);
      if (TaskManager.recordTaskMetadata) {
        this.addLocation(task);
        task.addDescription(this.getDescription(task));
      }
      task.enhance(Task.formatDeps(deps), block);
      if (orderOnly != null) task.bitwiseOr(orderOnly);
      return task;
    } finally {
      this._scope = originalScope;
    }
  }

  intern(taskClass: typeof Task, taskName: string): Task {
    let task = this._tasks.get(String(taskName));
    if (task == null) {
      task = new taskClass(taskName, this);
      this._tasks.set(String(taskName), task);
    }
    return task;
  }

  async get(taskName: string, scopes: Scope | null = null): Promise<Task> {
    taskName = String(taskName);
    const task =
      this.lookup(taskName, scopes) ??
      (await this.enhanceWithMatchingRule(taskName)) ??
      (await this.synthesizeFileTask(taskName));
    if (task == null) throw new RuntimeError(this.generateMessageForUndefinedTask(taskName));
    return task;
  }

  generateMessageForUndefinedTask(taskName: string): string {
    const message =
      `Don't know how to build task '${taskName}' ` +
      `(See the list of available tasks with \`${Rake.application!.name} --tasks\`)`;
    return message + this.generateDidYouMeanSuggestions(taskName);
  }

  /** @missingRailsCall correct — CONVERGEABLE rake-did-you-mean-suggestions */
  generateDidYouMeanSuggestions(taskName: string): string {
    void taskName;
    return "";
  }

  async synthesizeFileTask(taskName: string): Promise<Task | null> {
    if (!(await File.isExistAsync(taskName))) return null;
    return this.defineTask(FileTask, taskName);
  }

  resolveArgs(args: unknown[]): ResolvedArgs {
    const last = args.at(-1);
    if (last instanceof Map || isPlainHash(last)) {
      const deps = args.pop() as Map<unknown, unknown> | Record<string, unknown>;
      return this.resolveArgsWithDependencies(args, deps);
    } else {
      return this.resolveArgsWithoutDependencies(args);
    }
  }

  /** @internal */
  resolveArgsWithoutDependencies(args: unknown[]): ResolvedArgs {
    const taskName = args.shift();
    let argNames: string[];
    const first = args.length === 1 ? rbCheckArrayType(args[0]) : null;
    if (first != null) {
      argNames = first as string[];
    } else {
      argNames = args as string[];
    }
    return [taskName, argNames, [], null];
  }

  /** @internal */
  resolveArgsWithDependencies(
    args: unknown[],
    hash: Map<unknown, unknown> | Record<string, unknown>,
  ): ResolvedArgs {
    const isMap = hash instanceof Map;
    const size = isMap ? hash.size : Object.keys(hash).length;
    const hasOrderOnly = isMap ? hash.has("orderOnly") : "orderOnly" in hash;
    if (size !== 1 && (size !== 2 || !hasOrderOnly)) {
      throw new RuntimeError("Task Argument Error");
    }
    const orderOnly = (isMap ? hash.get("orderOnly") : hash.orderOnly) ?? null;
    if (isMap) hash.delete("orderOnly");
    else delete hash.orderOnly;
    const [key, value] = (isMap ? [...hash] : Object.entries(hash))[0] ?? [];
    let taskName: unknown;
    let argNames: string[];
    let deps: unknown;
    if (args.length === 0) {
      taskName = key;
      argNames = [];
      deps = rtest(value) ? value : [];
    } else {
      taskName = args.shift();
      let names: unknown = key;
      if (!rtest(names)) names = args.shift();
      argNames = (rtest(names) ? names : []) as string[];
      deps = rtest(value) ? value : [];
    }
    deps = rbCheckArrayType(deps) ?? [deps];
    return [taskName, argNames, deps as unknown[], orderOnly];
  }

  async enhanceWithMatchingRule(taskName: string, level = 0): Promise<Task | null> {
    try {
      if (level >= 16) throw new RuleRecursionOverflowError("Rule Recursion Too Deep");
      for (const [pattern, args, extensions, orderOnly, block] of this._rules) {
        if (pattern != null && taskName.match(pattern)) {
          const task = await this.attemptRule(taskName, pattern, args, extensions, block, level);
          if (orderOnly != null) task?.bitwiseOr(orderOnly);
          if (task) return task;
        }
      }
      return null;
    } catch (ex) {
      if (ex instanceof RuleRecursionOverflowError) ex.addTarget(taskName);
      throw ex;
    }
  }

  get tasks(): Task[] {
    return [...this._tasks.values()].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  tasksInScope(scope: Scope): Task[] {
    const prefix = scope.path;
    return this.tasks.filter((t) => new RegExp(`^${prefix}:`, "m").test(t.name));
  }

  clear(): void {
    this._tasks.clear();
    this._rules.length = 0;
  }

  lookup(taskName: string, initialScope: Scope | null = null): Task | null {
    initialScope ??= this._scope;
    taskName = String(taskName);
    let scopes: Scope;
    let m: RegExpMatchArray | null;
    if (/^rake:/m.test(taskName)) {
      scopes = Scope.make() as Scope;
      taskName = taskName.replace(/^rake:/m, "");
    } else if ((m = taskName.match(/^(\^+)/m))) {
      scopes = initialScope.trim(m[1].length);
      taskName = taskName.replace(/^(\^+)/m, "");
    } else {
      scopes = initialScope;
    }
    return this.lookupInScope(taskName, scopes);
  }

  /** @internal */
  lookupInScope(name: string, scope: Scope): Task | null {
    for (;;) {
      const tn = scope.pathWithTaskName(name);
      const task = this._tasks.get(tn);
      if (task) return task;
      if (scope.isEmpty()) break;
      scope = scope.tail;
    }
    return null;
  }

  get currentScope(): Scope {
    return this._scope;
  }

  inNamespace(name: string | null, block: (ns: NameSpace) => unknown): NameSpace {
    name ??= this.generateName();
    this._scope = new Scope(name, this._scope);
    try {
      const ns = new NameSpace(this, this._scope);
      block(ns);
      return ns;
    } finally {
      this._scope = this._scope.tail;
    }
  }

  /** @internal */
  addLocation(task: Task): Task {
    const loc = this.findLocation();
    if (loc != null) task.locations.push(loc);
    return task;
  }

  /** @internal */
  findLocation(): string | null {
    const locations = rbFCaller();
    let i = 0;
    while (locations[i] != null) {
      if (/rake\/(?:src|dist)\/dsl-definition\./.test(locations[i])) {
        return locations[i + 1] ?? null;
      }
      i += 1;
    }
    return null;
  }

  /** @internal */
  generateName(): string {
    this._seed ??= 0;
    this._seed += 1;
    return `_anon_${this._seed}`;
  }

  /** @internal */
  traceRule(level: number, message: string): void {
    if (Rake.application!.options.traceRules) {
      this.options.traceOutput!.puts(`${"    ".repeat(level)}${message}`);
    }
  }

  /** @internal */
  async attemptRule(
    taskName: string,
    taskPattern: RegExp,
    args: string[],
    extensions: unknown[],
    block: TaskAction | undefined,
    level: number,
  ): Promise<Task | null> {
    const sources = this.makeSources(taskName, taskPattern, extensions);
    const prereqs: string[] = [];
    for (const source of sources) {
      this.traceRule(level, `Attempting Rule ${taskName} => ${source}`);
      let parent: Task | null;
      if ((await File.isExistAsync(source)) || Task.isTaskDefined(source)) {
        this.traceRule(level, `(${taskName} => ${source} ... EXIST)`);
        prereqs.push(source);
      } else if ((parent = await this.enhanceWithMatchingRule(source, level + 1))) {
        this.traceRule(level, `(${taskName} => ${source} ... ENHANCE)`);
        prereqs.push(parent.name);
      } else {
        this.traceRule(level, `(${taskName} => ${source} ... FAIL)`);
        return null;
      }
    }
    const definition = new Map<unknown, unknown>([[args, prereqs]]);
    const task = block
      ? FileTask.defineTask(taskName, definition, block)
      : FileTask.defineTask(taskName, definition);
    task.sources = prereqs;
    return task;
  }

  /** @internal */
  makeSources(taskName: string, taskPattern: RegExp, extensions: unknown[]): string[] {
    const result = extensions.map((ext) => {
      if (typeof ext === "string") {
        if (/%/.test(ext)) {
          return pathmap(taskName, ext);
        } else if (/\//.test(ext)) {
          return ext;
        } else if (/^\./m.test(ext)) {
          const source = rbStrSub({ string: taskName }, taskPattern, ext);
          return source === ext ? stringExt(taskName, ext) : source;
        }
        return ext;
      } else if (typeof ext === "function" || ext instanceof Method) {
        const arity = ext instanceof Method ? ext.arity() : ext.length;
        return arity === 1 ? rbProcCall(ext, taskName) : rbProcCall(ext);
      } else {
        throw new RuntimeError(`Don't know how to handle rule dependent: ${rbInspect(ext)}`);
      }
    });
    return flatten(result) as string[];
  }

  /** @internal */
  getDescription(task: Task): string | null {
    void task;
    const desc = this.lastDescription;
    this.lastDescription = null;
    return desc;
  }
}
