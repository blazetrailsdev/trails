import {
  AbstractAdapter,
  AdapterNotFound,
  AdapterNotSpecified,
  Base as ActiveRecordBase,
  ConnectionAdapters,
} from "@blazetrails/activerecord";
import { isPresent } from "@blazetrails/activesupport";
import {
  LoadError,
  NotImplementedError,
  abort,
  getPath,
  include,
  rbInspect,
  type Included,
  rbSetClassPathString,
} from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { Command } from "commander";
import { environment } from "../command.js";
import { APP_PATH } from "../app-path.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { databaseConfiguration } from "../database.js";

interface DBConsoleOptions {
  environment?: string;
  database?: string;
  includePassword?: boolean;
  mode?: string;
  header?: boolean;
}

type DatabaseConfigurations = ReturnType<typeof ActiveRecordBase.configurations>;
type DbConfig = NonNullable<ReturnType<DatabaseConfigurations["findDbConfig"]>>;
type AdapterClass = {
  dbconsole(config: DbConfig, options?: DBConsoleOptions): unknown;
};

export class DBConsole {
  /** @internal */
  private options: DBConsoleOptions;
  /** @internal */
  private _dbConfig: DbConfig | undefined;

  static start(...args: [options?: DBConsoleOptions]): Promise<void> {
    return new this(...args).start();
  }

  constructor(options: DBConsoleOptions = {}) {
    this.options = options;
    this.options.environment ||= environment();
  }

  async start(): Promise<void> {
    try {
      (await this.adapterClass()).dbconsole(await this.dbConfig(), this.options);
    } catch (error) {
      if (
        error instanceof NotImplementedError ||
        error instanceof AdapterNotFound ||
        error instanceof LoadError
      ) {
        abort(error.message);
      }
      throw error;
    }
  }

  /** @inventedArm load — PERMANENT */
  async dbConfig(): Promise<DbConfig> {
    if (this._dbConfig == null) {
      const configurations = await this.configurations();
      let config: DbConfig | undefined;
      if (this.database() != null) {
        config = this._dbConfig = configurations.configsFor({
          envName: this.environment(),
          name: this.database()!,
          includeHidden: true,
        });
      } else {
        config = this._dbConfig = configurations.findDbConfig(this.environment()!);
      }

      if (!config) {
        const missingDb =
          this.database() != null ? `'${this.database()}' database is not` : "No databases are";
        throw new AdapterNotSpecified(
          `${missingDb} configured for '${this.environment()}'. Available configuration: ${rbInspect(configurations)}`,
        );
      }

      await ConnectionAdapters.load(config.adapter);
      config.validateBang();
      this._dbConfig = config;
    }
    return this._dbConfig;
  }

  database(): string | undefined {
    return this.options.database;
  }

  environment(): string | undefined {
    return this.options.environment;
  }

  /** @internal */
  private async adapterClass(): Promise<AdapterClass> {
    try {
      return ConnectionAdapters.resolve((await this.dbConfig()).adapter) as unknown as AdapterClass;
    } catch (error) {
      if (!(error instanceof LoadError)) throw error;
      return AbstractAdapter as unknown as AdapterClass;
    }
  }

  /**
   * @internal
   * @missingRailsCall application — CONVERGEABLE database-configuration-reads-config-database-yml
   */
  protected async configurations(): Promise<DatabaseConfigurations> {
    if (APP_PATH != null) await import(getPath().pathToFileURL!(APP_PATH).href);
    ActiveRecordBase.configurations(
      (await databaseConfiguration()) as Parameters<typeof ActiveRecordBase.configurations>[0],
    );
    return ActiveRecordBase.configurations();
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface DbconsoleCommand extends Included<typeof EnvironmentArgument> {
  /** @internal */
  _environment?: string;
  /** @internal */
  _environmentSpecified?: boolean;
  /** @internal */
  _availableEnvironments?: string[];
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class DbconsoleCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & DBConsoleOptions>;

  static {
    const klass = this as unknown as ThorClass;
    include(this, EnvironmentArgument);
    klass.classOption("includePassword", {
      aliases: "-p",
      type: "boolean",
      desc: "Automatically provide the password from database.yml",
    });
    klass.classOption("mode", {
      enum: ["html", "list", "line", "column"],
      type: "string",
      desc: "Automatically put the sqlite3 database in the specified mode",
    });
    klass.classOption("header", { type: "boolean" });
    klass.classOption("database", {
      aliases: "--db",
      type: "string",
      desc: "Specify the database to use.",
    });
    klass.methodAdded("perform");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);

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
    await DBConsole.start(this.options);
  }
}

export function dbconsoleCommand(): Command {
  const klass = DbconsoleCommand;
  const cmd = new Command(klass.commandName());
  cmd.description("Start a console for the database specified in config/database.yml");
  cmd.argument("[args...]").allowUnknownOption().helpOption(false);
  cmd.action(async (_args: string[], _options: object, command: Command) => {
    await klass.perform(klass.commandName(), command.args, {});
  });

  return cmd;
}

rbSetClassPathString(DbconsoleCommand, { name: "Rails::Command" }, "DbconsoleCommand");
