import { BooleanType, Errors, Model, ValidationsCallbacks } from "@blazetrails/activemodel";
import { ActiveRecordError, gemVersion } from "@blazetrails/activerecord";
import {
  IsolatedExecutionState,
  TopLevel,
  camelize,
  include,
  inquiry,
  isPlainObject,
  isPresent,
  presence,
  reverseMerge,
  safeConstantize,
  slice,
  titleize,
  transformKeys,
  type StringInquirer,
} from "@blazetrails/activesupport";
import { ConfigurationFile } from "@blazetrails/activesupport/configuration-file";
import {
  File,
  Gem,
  Pathname,
  RuntimeError,
  Struct,
  constSet,
  env,
  puts,
  rbInspect,
  stderr as $stderr,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { RecurringTask } from "./recurring-task.js";
import { Record } from "./record.js";
import { SolidQueue } from "./solid-queue.js";

type Options = { [key: string]: unknown };

export class Process extends Struct.new("kind", "attributes") {
  declare kind: string;
  declare attributes: Options;

  instantiate(): object {
    const klass = safeConstantize(`SolidQueue::${titleize(this.kind)}`) as new (
      attributes: Options,
    ) => object;
    return new klass(this.attributes);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveModel::Model` (configuration.rb:5); the class/interface merge is how `include()` surfaces on the type side.
export interface Configuration extends Model {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Configuration {
  declare static Process: typeof Process;
  declare static validate: typeof Model.validate;
  declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];

  static {
    constSet(SolidQueue, "Configuration", this);
    include(this, Model);
    include(this, ValidationsCallbacks);

    this.validate(":ensureConfiguredProcesses");
    this.validate(":ensureValidRecurringTasks");
    this.validate(":ensureValidWorkerExecutionOptions");
    this.validate(":ensureFiberWorkersUseSupportedIsolationLevel");
    this.validate(":warnAboutIncorrectlySizedDatabasePool");
    this.validate(":warnAboutMissingConfigFiles");

    (this as unknown as typeof Model & typeof Configuration).beforeValidation((configuration) => {
      (configuration as Configuration).warnings.clear();
    });

    constSet(this, "Process", Process);
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
    batchMaintenance: true,
  };

  static readonly SCHEDULER_DEFAULTS = {
    pollingInterval: 5,
    dynamicTasksEnabled: false,
  };

  static readonly DEFAULT_CONFIG_FILE_PATH = "config/queue.yml";
  static readonly DEFAULT_RECURRING_SCHEDULE_FILE_PATH = "config/recurring.yml";
  static readonly FIBER_QUERY_SCOPED_CONNECTIONS_VERSION = new Gem.Version("7.2.0");

  private options: Options;
  private _warnings?: Errors<Configuration>;
  private _workersOptions?: Options[];
  private _schedulerOptions?: Options;
  private _dispatchersOptions?: Options[];
  private _recurringTasks?: RecurringTask[];
  private _processesConfig?: Options;
  private _recurringTasksConfig?: Options;

  constructor(options: Options = {}) {
    this.options = reverseMerge(options, this.defaultOptions());
  }

  mode(): StringInquirer & { [predicate: string]: () => boolean } {
    return inquiry.call(String(this.options.mode ?? ""));
  }

  isStandalone(): unknown {
    return this.mode().isFork() || this.options.standalone;
  }

  async configuredProcesses(): Promise<Process[]> {
    if (this.isOnlyWork()) {
      return await this.workers();
    } else if (this.isOnlyRecurring()) {
      return await this.schedulers();
    } else {
      return [
        ...(await this.dispatchers()),
        ...(await this.workers()),
        ...(await this.schedulers()),
      ];
    }
  }

  get warnings(): Errors<Configuration> {
    return (this._warnings ??= new Errors(this));
  }

  async check(): Promise<boolean> {
    if (await this.isValid()) {
      for (const warning of this.warnings.fullMessages) puts.call($stderr, warning);
      puts.call($stdout, "Solid Queue configuration is valid.");

      return true;
    } else {
      puts.call($stderr, "Solid Queue configuration is invalid:");
      for (const message of [...this.warnings.fullMessages, ...this.errors.fullMessages]) {
        for (const line of message!.split(/(?<=\n)/))
          puts.call($stderr, `  ${line.replace(/\r?\n$/, "")}`);
      }

      return false;
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
  private async ensureValidWorkerExecutionOptions(): Promise<void> {
    for (const options of await this.workersOptions()) {
      if (Object.hasOwn(options, "threads") && Object.hasOwn(options, "fibers")) {
        this.errors.add("base", "Workers can specify either `threads` or `fibers`, but not both.");
      }
    }
  }

  /** @internal */
  private async ensureFiberWorkersUseSupportedIsolationLevel(): Promise<void> {
    if (!(await this.workersOptions()).some((options) => this.isFiberWorker(options))) return;

    if (IsolatedExecutionState.isolationLevel !== "fiber") {
      this.errors.add(
        "base",
        "Fiber workers require fiber-scoped isolated execution state. " +
          "Set `config.active_support.isolation_level = :fiber` in your Rails configuration " +
          "(or `ActiveSupport::IsolatedExecutionState.isolation_level = :fiber` outside Rails).",
      );
    }
  }

  /** @internal */
  private async warnAboutIncorrectlySizedDatabasePool(): Promise<void> {
    try {
      const dbPoolSize = Record.connectionPool()?.size;

      if (dbPoolSize != null && dbPoolSize < (await this.estimatedDatabasePoolSize())) {
        this.warnings.add(
          "base",
          `Warning: Solid Queue needs at least ${await this.estimatedDatabasePoolSize()} database connections ` +
            `for the configured workers but the database connection pool is ${dbPoolSize}. Increase it in \`config/database.yml\``,
        );
      }
    } catch (error) {
      if (!(error instanceof ActiveRecordError)) throw error;
    }
  }

  /** @internal */
  private async warnAboutMissingConfigFiles(): Promise<void> {
    const files = [this.options.configFile];
    if (!this.isSkipRecurringTasks()) files.push(this.options.recurringScheduleFile);

    for (const file of files.filter((file) => file != null)) {
      if (!(await File.isExistAsync(String(new Pathname(String(file)))))) {
        this.warnings.add(
          "base",
          `Warning: provided configuration file '${String(file)}' does not exist. Falling back to default configuration.`,
        );
      }
    }
  }

  /** @internal */
  private defaultOptions(): Options {
    const root = new Pathname(TopLevel.Trails!.root()!);
    return {
      mode: env.SOLID_QUEUE_SUPERVISOR_MODE || "fork",
      standalone: true,
      configFile: root.join(env.SOLID_QUEUE_CONFIG || Configuration.DEFAULT_CONFIG_FILE_PATH),
      recurringScheduleFile: root.join(
        env.SOLID_QUEUE_RECURRING_SCHEDULE || Configuration.DEFAULT_RECURRING_SCHEDULE_FILE_PATH,
      ),
      onlyWork: false,
      onlyDispatch: false,
      onlyRecurring: new BooleanType().cast(env.SOLID_QUEUE_ONLY_RECURRING),
      skipRecurring: new BooleanType().cast(env.SOLID_QUEUE_SKIP_RECURRING),
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
  private isOnlyRecurring(): boolean {
    return this.options.onlyRecurring as boolean;
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
      const defaults = this.workerDefaultsFor(workerOptions);
      return Array.from(
        { length: processes },
        () => new Process("worker", reverseMerge(workerOptions, defaults)),
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
    if (this.isSkipRecurringTasks()) return [];

    if ((await this.recurringTasks()).length > 0 || (await this.isDynamicRecurringTasksEnabled())) {
      return [
        new Process("scheduler", {
          recurringTasks: await this.recurringTasks(),
          ...reverseMerge(await this.schedulerOptions(), Configuration.SCHEDULER_DEFAULTS),
        }),
      ];
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
  private async schedulerOptions(): Promise<Options> {
    const processesConfig = await this.processesConfig();
    return (this._schedulerOptions ??= transformKeys(
      {
        ...((Object.hasOwn(processesConfig, "scheduler")
          ? processesConfig.scheduler
          : {}) as Options),
      },
      (key) => camelize(key, false),
    ));
  }

  /** @internal */
  private async isDynamicRecurringTasksEnabled(): Promise<boolean> {
    const schedulerOptions = await this.schedulerOptions();
    return (
      Object.hasOwn(schedulerOptions, "dynamicTasksEnabled")
        ? schedulerOptions.dynamicTasksEnabled
        : Configuration.SCHEDULER_DEFAULTS.dynamicTasksEnabled
    ) as boolean;
  }

  /** @internal */
  private async recurringTasks(): Promise<RecurringTask[]> {
    await RecurringTask.loadSchema();
    return (this._recurringTasks ??= Object.entries(await this.recurringTasksConfig())
      .map(([id, options]) =>
        options != null && Object.hasOwn(options as Options, "schedule")
          ? RecurringTask.fromConfiguration(id, { ...(options as Options), static: true })
          : null,
      )
      .filter((task): task is RecurringTask => task != null));
  }

  /** @internal */
  private async processesConfig(): Promise<Options> {
    return (this._processesConfig ??= await this.configFrom(
      presence(slice(this.options, "workers", "dispatchers", "scheduler")) ||
        this.options.configFile,
      {
        keys: ["workers", "dispatchers", "scheduler"],
        fallback: {
          workers: [Configuration.WORKER_DEFAULTS],
          dispatchers: [Configuration.DISPATCHER_DEFAULTS],
          scheduler: Configuration.SCHEDULER_DEFAULTS,
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
    config = config[env] != null && config[env] !== false ? (config[env] as Options) : config;
    if (keys.length > 0 && isPresent(config)) config = slice(config, ...keys);

    if (Object.keys(config).length === 0) {
      return fallback;
    } else {
      return config;
    }
  }

  /** @internal */
  private async loadConfigFrom(fileOrHash: unknown): Promise<Options> {
    if (isPlainObject(fileOrHash)) {
      return { ...(fileOrHash as Options) };
    } else if (fileOrHash instanceof Pathname || typeof fileOrHash === "string") {
      return await this.loadConfigFromFile(new Pathname(String(fileOrHash)));
    } else if (fileOrHash == null) {
      return {};
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
  private async estimatedDatabasePoolSize(): Promise<number> {
    const sizes = (await this.workersOptions()).map((options) =>
      this.estimatedDatabasePoolSizeForWorker(options),
    );
    const workerPoolSize = sizes.length > 0 ? Math.max(...sizes) : null;
    return workerPoolSize ?? 1;
  }

  /** @internal */
  private estimatedDatabasePoolSizeForWorker(options: Options): number {
    return this.estimatedExecutionConnectionsForWorker(options) + 2;
  }

  /** @internal */
  private workerCapacity(options: Options): number {
    return (options.fibers ?? options.threads ?? Configuration.WORKER_DEFAULTS.threads) as number;
  }

  /** @internal */
  private estimatedExecutionConnectionsForWorker(options: Options): number {
    return this.isFiberWorker(options)
      ? this.fiberExecutionConnectionsForWorker(options)
      : this.workerCapacity(options);
  }

  /** @internal */
  private fiberExecutionConnectionsForWorker(options: Options): number {
    return this.isFiberJobsReleaseConnectionsBetweenQueries() ? 1 : this.workerCapacity(options);
  }

  /** @internal */
  private isFiberJobsReleaseConnectionsBetweenQueries(): boolean {
    return gemVersion().compare(Configuration.FIBER_QUERY_SCOPED_CONNECTIONS_VERSION)! >= 0;
  }

  /** @internal */
  private isFiberWorker(options: Options): boolean {
    return Object.hasOwn(options, "fibers");
  }

  /** @internal */
  private workerDefaultsFor(options: Options): Options {
    if (this.isFiberWorker(options)) {
      const { threads: _threads, ...defaults } = Configuration.WORKER_DEFAULTS;
      return defaults;
    } else {
      return Configuration.WORKER_DEFAULTS;
    }
  }
}
