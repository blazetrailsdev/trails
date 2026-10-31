import { isPresent } from "@blazetrails/activesupport";
import { exit, include, type Included } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { environment } from "../command.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { Trails } from "../rails.js";
import { IRBConsole } from "./console/irb-console.js";

interface ConsoleOptions {
  sandbox?: boolean | null;
  environment?: string;
}

interface ConsoleRunner {
  start(): unknown;
}

interface ConsoleApp {
  sandbox: boolean | null | undefined;
  config: {
    console?: ConsoleRunner | null;
    disableSandbox?: boolean;
    sandboxByDefault?: boolean;
  };
  name?(): string;
  loadConsole(): unknown;
}

export class Console {
  static start(...args: [app: ConsoleApp, options?: ConsoleOptions]): Promise<void> {
    return new this(...args).start();
  }

  readonly options: ConsoleOptions;
  readonly app: ConsoleApp;
  readonly console: ConsoleRunner;

  constructor(app: ConsoleApp, options: ConsoleOptions = {}) {
    this.app = app;
    this.options = options;

    app.sandbox = this.isSandbox();

    if (this.isSandbox() && app.config.disableSandbox) {
      console.log(
        "Error: Unable to start console in sandbox mode as sandbox mode is disabled (config.disableSandbox is true).",
      );
      exit(1);
    }

    app.loadConsole();

    this.console = app.config.console || new IRBConsole(app);
  }

  isSandbox(): boolean | undefined {
    if (this.options.sandbox != null) return this.options.sandbox;

    if (Trails.env["local?"]()) return false;

    return this.app.config.sandboxByDefault;
  }

  environment(): string | undefined {
    return this.options.environment;
  }

  isEnvironment(): string | undefined {
    return this.environment();
  }

  setEnvironmentBang(): void {
    Trails.env = this.environment()!;
  }

  async start(): Promise<void> {
    if (this.isEnvironment()) this.setEnvironmentBang();

    if (this.isSandbox()) {
      console.log(`Loading ${Trails.env} environment in sandbox (Trails ${Trails.version()})`);
      console.log("Any modifications you make will be rolled back on exit");
    } else {
      console.log(`Loading ${Trails.env} environment (Trails ${Trails.version()})`);
    }

    await this.console.start();
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface ConsoleCommand extends Included<typeof EnvironmentArgument> {
  /** @internal */
  _environment?: string;
  /** @internal */
  _environmentSpecified?: boolean;
  /** @internal */
  _availableEnvironments?: string[];
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class ConsoleCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & ConsoleOptions>;

  static {
    const klass = this as unknown as ThorClass;
    include(this, EnvironmentArgument);
    klass.classOption("sandbox", {
      aliases: "-s",
      type: "boolean",
      default: null,
      desc: "Rollback database modifications on exit.",
    });
    klass.desc("console", "Start the Trails console");
    klass.methodAdded("perform");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...[args = [], localOptions = {}, config = {}]: ConstructorParameters<typeof Base>) {
    if (Array.isArray(localOptions)) {
      const termination = localOptions.indexOf("--");
      if (termination !== -1) localOptions = localOptions.slice(0, termination);
    }

    super(args, localOptions, config);

    this._environmentSpecified = isPresent(this.options.environment);

    if (!this._environmentSpecified) {
      this.options = this.options.merge({ environment: environment() });
    } else if (!this.availableEnvironments().includes(this.options.environment!)) {
      this.options = this.options.merge({
        environment: this.expandEnvironmentName(this.options.environment!),
      });
    }
  }

  async perform(): Promise<void> {
    await this.bootApplicationBang();
    await Console.start(Trails.application as unknown as ConsoleApp, this.options);
  }
}
