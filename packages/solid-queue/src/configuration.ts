import { Model } from "@blazetrails/activemodel";
import {
  TopLevel,
  camelize,
  isPresent,
  presence,
  reverseMerge,
  safeConstantize,
  slice,
  titleize,
  transformKeys,
} from "@blazetrails/activesupport";
import { ConfigurationFile } from "@blazetrails/activesupport/configuration-file";
import { File, Pathname, RuntimeError, env, rbInspect } from "@blazetrails/ruby-compat";
import { RecurringTask } from "./recurring-task.js";
import { Record } from "./record.js";

type Options = { [key: string]: unknown };

class Process {
  constructor(
    public kind: string,
    public attributes: Options,
  ) {}

  instantiate(): object {
    const klass = safeConstantize(`SolidQueue::${titleize(this.kind)}`) as new (
      attributes: Options,
    ) => object;
    return new klass(this.attributes);
  }
}

export class Configuration extends Model {
  static override toString(): string {
    return "SolidQueue::Configuration";
  }

  static Process = Process;

  static {
    this.validate(":ensureConfiguredProcesses");
    this.validate(":ensureValidRecurringTasks");
    this.validate(":ensureCorrectlySizedThreadPool");
  }

  static readonly WORKER_DEFAULTS = {
    queues: "*",
    threads: 3,
    processes: 1,
    pollingInterval: 0.1,
  };

  static readonly DISPATCHER_DEFAULTS = {
    batchSize: 500,
    pollingInterval: 1,
    concurrencyMaintenance: true,
    concurrencyMaintenanceInterval: 600,
  };

  static readonly DEFAULT_CONFIG_FILE_PATH = "config/queue.yml";
  static readonly DEFAULT_RECURRING_SCHEDULE_FILE_PATH = "config/recurring.yml";

  private options: Options;
  private _workersOptions?: Options[];
  private _dispatchersOptions?: Options[];
  private _recurringTasks?: RecurringTask[];
  private _processesConfig?: Options;
  private _recurringTasksConfig?: Options;

  constructor(options: Options = {}) {
    super(null);
    this.options = reverseMerge(options, this.defaultOptions());
  }

  async configuredProcesses(): Promise<Process[]> {
    if (this.isOnlyWork()) {
      return await this.workers();
    } else {
      return [
        ...(await this.dispatchers()),
        ...(await this.workers()),
        ...(await this.schedulers()),
      ];
    }
  }

  async errorMessages(): Promise<string> {
    if ((await this.configuredProcesses()).length === 0) {
      return "No workers or processed configured. Exiting...";
    } else {
      const errorMessages = (await this.invalidTasks())
        .map((task) => {
          const allMessages = task.errors.fullMessages.map((msg) => `\t${msg}`).join("\n");
          return `${task.key}:\n${allMessages}`;
        })
        .join("\n");

      return `Invalid processes configured:\n${errorMessages}`;
    }
  }

  /** @internal */
  private async ensureConfiguredProcesses(): Promise<void> {
    if (!((await this.configuredProcesses()).length > 0)) {
      this.errors.add("base", "No processes configured");
    }
  }

  /** @internal */
  private async ensureValidRecurringTasks(): Promise<void> {
    if (!(this.isSkipRecurringTasks() || (await this.invalidTasks()).length === 0)) {
      const errorMessages = (await this.invalidTasks()).map(
        (task) => `- ${task.key}: ${task.errors.fullMessages.join(", ")}`,
      );

      this.errors.add("base", `Invalid recurring tasks:\n${errorMessages.join("\n")}`);
    }
  }

  /** @internal */
  private async ensureCorrectlySizedThreadPool(): Promise<void> {
    const dbPoolSize = Record.connectionPool()?.size;
    if (dbPoolSize != null && dbPoolSize < (await this.estimatedNumberOfThreads())) {
      this.errors.add(
        "base",
        `Solid Queue is configured to use ${await this.estimatedNumberOfThreads()} threads but the ` +
          `database connection pool is ${dbPoolSize}. Increase it in \`config/database.yml\``,
      );
    }
  }

  /** @internal */
  private defaultOptions(): Options {
    const root = new Pathname(TopLevel.Trails!.root()!);
    return {
      configFile: root.join(env.SOLID_QUEUE_CONFIG || Configuration.DEFAULT_CONFIG_FILE_PATH),
      recurringScheduleFile: root.join(
        env.SOLID_QUEUE_RECURRING_SCHEDULE || Configuration.DEFAULT_RECURRING_SCHEDULE_FILE_PATH,
      ),
      onlyWork: false,
      onlyDispatch: false,
      skipRecurring: false,
    };
  }

  /** @internal */
  private async invalidTasks(): Promise<RecurringTask[]> {
    const invalid: RecurringTask[] = [];
    for (const task of await this.recurringTasks()) {
      if (await task.isInvalid()) invalid.push(task);
    }
    return invalid;
  }

  /** @internal */
  private isOnlyWork(): boolean {
    return this.options.onlyWork as boolean;
  }

  /** @internal */
  private isOnlyDispatch(): boolean {
    return this.options.onlyDispatch as boolean;
  }

  /** @internal */
  private isSkipRecurringTasks(): boolean {
    return (this.options.skipRecurring as boolean) || this.isOnlyWork();
  }

  /** @internal */
  private async workers(): Promise<Process[]> {
    return (await this.workersOptions()).flatMap((workerOptions) => {
      const processes = (
        Object.hasOwn(workerOptions, "processes")
          ? workerOptions.processes
          : Configuration.WORKER_DEFAULTS.processes
      ) as number;
      return Array.from(
        { length: processes },
        () => new Process("worker", reverseMerge(workerOptions, Configuration.WORKER_DEFAULTS)),
      );
    });
  }

  /** @internal */
  private async dispatchers(): Promise<Process[]> {
    return (await this.dispatchersOptions()).map(
      (dispatcherOptions) =>
        new Process(
          "dispatcher",
          reverseMerge(dispatcherOptions, Configuration.DISPATCHER_DEFAULTS),
        ),
    );
  }

  /** @internal */
  private async schedulers(): Promise<Process[]> {
    if (!this.isSkipRecurringTasks() && (await this.recurringTasks()).length > 0) {
      return [new Process("scheduler", { recurringTasks: await this.recurringTasks() })];
    } else {
      return [];
    }
  }

  /** @internal */
  private async workersOptions(): Promise<Options[]> {
    const processesConfig = await this.processesConfig();
    return (this._workersOptions ??= (
      (Object.hasOwn(processesConfig, "workers") ? processesConfig.workers : []) as Options[]
    ).map((options) => transformKeys({ ...options }, (key) => camelize(key, false))));
  }

  /** @internal */
  private async dispatchersOptions(): Promise<Options[]> {
    const processesConfig = await this.processesConfig();
    return (this._dispatchersOptions ??= (
      (Object.hasOwn(processesConfig, "dispatchers")
        ? processesConfig.dispatchers
        : []) as Options[]
    ).map((options) => transformKeys({ ...options }, (key) => camelize(key, false))));
  }

  /** @internal */
  private async recurringTasks(): Promise<RecurringTask[]> {
    return (this._recurringTasks ??= Object.entries(await this.recurringTasksConfig())
      .map(([id, options]) =>
        options != null && Object.hasOwn(options as Options, "schedule")
          ? RecurringTask.fromConfiguration(id, options as Options)
          : null,
      )
      .filter((task): task is RecurringTask => task != null));
  }

  /** @internal */
  private async processesConfig(): Promise<Options> {
    return (this._processesConfig ??= await this.configFrom(
      presence(slice(this.options, "workers", "dispatchers")) || this.options.configFile,
      {
        keys: ["workers", "dispatchers"],
        fallback: {
          workers: [Configuration.WORKER_DEFAULTS],
          dispatchers: [Configuration.DISPATCHER_DEFAULTS],
        },
      },
    ));
  }

  /** @internal */
  private async recurringTasksConfig(): Promise<Options> {
    return (this._recurringTasksConfig ??= await this.configFrom(
      this.options.recurringScheduleFile,
    ));
  }

  /** @internal */
  private async configFrom(
    fileOrHash: unknown,
    {
      keys = [],
      fallback = {},
      env = String(TopLevel.Trails!.env),
    }: { keys?: string[]; fallback?: Options; env?: string } = {},
  ): Promise<Options> {
    let config = await this.loadConfigFrom(fileOrHash);
    config = config[env] ? (config[env] as Options) : config;
    if (keys.length > 0 && isPresent(config)) config = slice(config, ...keys);

    if (Object.keys(config).length === 0) {
      return fallback;
    } else {
      return config;
    }
  }

  /** @internal */
  private async loadConfigFrom(fileOrHash: unknown): Promise<Options> {
    if (fileOrHash instanceof Pathname || typeof fileOrHash === "string") {
      return await this.loadConfigFromFile(new Pathname(String(fileOrHash)));
    } else if (fileOrHash == null) {
      return {};
    } else if (typeof fileOrHash === "object") {
      return { ...(fileOrHash as Options) };
    } else {
      throw new RuntimeError(`Solid Queue cannot be initialized with ${rbInspect(fileOrHash)}`);
    }
  }

  /** @internal */
  private async loadConfigFromFile(file: Pathname): Promise<Options> {
    if (await File.isExistAsync(String(file))) {
      return ConfigurationFile.parse(String(file), { merge: true }) as Options;
    } else {
      return {};
    }
  }

  /** @internal */
  private async estimatedNumberOfThreads(): Promise<number> {
    const threadCounts = (await this.workersOptions()).map(
      (options) =>
        (Object.hasOwn(options, "threads")
          ? options.threads
          : Configuration.WORKER_DEFAULTS.threads) as number,
    );
    const threadCount = threadCounts.length > 0 ? Math.max(...threadCounts) : null;
    return (threadCount ?? 1) + 2;
  }
}
