import {
  AbstractAdapter,
  AdapterNotFound,
  AdapterNotSpecified,
  Base as ActiveRecordBase,
  ConnectionAdapters,
} from "@blazetrails/activerecord";
import { LoadError, NotImplementedError, abort, rbInspect } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { environment } from "../command.js";
import { bootApplicationBang, requireApplicationBang } from "../command/actions.js";
import { Base } from "../command/base.js";
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
    await requireApplicationBang();
    ActiveRecordBase.configurations(
      (await databaseConfiguration()) as Parameters<typeof ActiveRecordBase.configurations>[0],
    );
    return ActiveRecordBase.configurations();
  }
}

export class DbconsoleCommand extends Base {
  static {
    this.classOption("includePassword", {
      aliases: "-p",
      type: "boolean",
      desc: "Automatically provide the password from database.yml",
    });
    this.classOption("mode", {
      type: "string",
      desc: "Automatically put the sqlite3 database in the specified mode",
    });
    this.classOption("header", { type: "boolean" });
    this.classOption("database", {
      aliases: "--db",
      type: "string",
      desc: "Specify the database to use.",
    });
  }

  async perform(): Promise<void> {
    await bootApplicationBang();
    await DBConsole.start(this.options);
  }
}

export function dbconsoleCommand(): Command {
  const klass = DbconsoleCommand;
  const cmd = new Command(klass.commandName());
  cmd.description("Start a console for the database specified in config/database.yml");
  for (const [name, option] of Object.entries(klass.classOptions())) {
    const flag = `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    const long = option.type === "boolean" ? flag : `${flag} <${name}>`;
    cmd.option([...[option.aliases ?? []].flat(), long].join(", "), option.desc);
  }
  cmd.action(async (options: DBConsoleOptions, command: Command) => {
    await klass.perform(klass.commandName(), command.args, { options });
  });

  return cmd;
}
