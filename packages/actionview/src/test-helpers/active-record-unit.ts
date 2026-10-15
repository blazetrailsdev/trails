import "./abstract-unit.js";
import { Base } from "@blazetrails/activerecord";
import {
  ClassMethods as TestFixturesClassMethods,
  TestFixtures,
} from "@blazetrails/activerecord/test-fixtures";
import { Notifications, cattrAccessor, isBlank } from "@blazetrails/activesupport";
import { ActionController } from "@blazetrails/actionpack";
import {
  Dir,
  Module,
  include,
  File,
  RuntimeError,
  getFs,
  isRegisteredConstant,
  registerConstant,
  warn,
} from "@blazetrails/ruby-compat";

const __dir__ = new URL(".", import.meta.url).pathname;
const FIXTURE_LOAD_PATH = File.expandPath("fixtures", __dir__);

export class ActiveRecordTestConnector {
  declare static ableToConnect: boolean;
  declare static connected: boolean;

  static {
    cattrAccessor.call(this, "ableToConnect");
    cattrAccessor.call(this, "connected");

    this.connected = false;
    this.ableToConnect = true;
  }

  static async setup(): Promise<void> {
    try {
      if (!(this.connected || !this.ableToConnect)) {
        await this.setupConnection();
        await this.loadSchema();
        await this.requireFixtureModels();
        this.connected = true;
      }
    } catch (e) {
      warn(`\nSkipping ActiveRecord assertion tests: ${e}`);
      this.ableToConnect = false;
    }
  }

  static async reconnect(): Promise<void> {
    if (!this.ableToConnect) return;
    await (await Base.leaseConnection()).reconnectBang();
    await this.loadSchema();
  }

  private static async setupConnection(): Promise<void> {
    if (isRegisteredConstant("ActiveRecord")) {
      const defaults = { database: ":memory:" };
      const options = { ...defaults, adapter: "sqlite3", timeout: 500 };
      await Base.establishConnection(options);
      Base.configurations({ sqlite3_ar_integration: options });
      await Base.leaseConnection();

      if (!isRegisteredConstant("QUOTED_TYPE")) {
        registerConstant("QUOTED_TYPE", (await Base.leaseConnection()).quoteColumnName("type"));
      }
    } else {
      throw new RuntimeError("Can't setup connection since ActiveRecord isn't loaded.");
    }
  }

  private static async loadSchema(): Promise<void> {
    const source = await getFs().readFile(
      File.expandPath("fixtures/db_definitions/sqlite.sql", __dir__),
      "utf-8",
    );
    for (const sql of source.split(";")) {
      if (!isBlank(sql)) await (await Base.leaseConnection()).execute(sql);
    }
  }

  private static async requireFixtureModels(): Promise<void> {
    for (const f of Dir.glob(File.expandPath("fixtures/*.ts", __dir__))) await import(f);
  }
}

type ControllerClass = Parameters<typeof ActionController.TestCase.tests>[0];

/** @missingRailsCall after_fork_hook — CONVERGEABLE active-record-unit-registers-parallelization-after-fork-hook */
export class ActiveRecordTestCase extends ActionController.TestCase {
  declare static fixturePaths: string[];
  declare static useTransactionalTests: boolean;

  static {
    include(this, TestFixtures);
  }

  static override tests(controller: ControllerClass): void {
    super.tests(controller);
    if ((controller as unknown as { ROUTES?: unknown }).ROUTES !== undefined) {
      const mod = new Module();
      mod.defineMethod("setup", function (this: { routes: unknown }) {
        mod.superMethod(this, "setup")!();
        this.routes = (controller as unknown as { ROUTES: unknown }).ROUTES;
      });
      include(this, mod);
    }
  }

  static {
    if (ActiveRecordTestConnector.ableToConnect) {
      this.fixturePaths = [FIXTURE_LOAD_PATH];
      this.useTransactionalTests = false;
    }
  }

  static fixtures(...args: unknown[]): void {
    if (ActiveRecordTestConnector.connected) {
      TestFixturesClassMethods.fixtures.call(
        this as unknown as ThisParameterType<typeof TestFixturesClassMethods.fixtures>,
        ...args,
      );
    }
  }

  override async run(): Promise<this> {
    if (ActiveRecordTestConnector.connected) return super.run();
    return undefined as unknown as this;
  }

  async captureSql(block: () => unknown): Promise<string[]> {
    await (await Base.leaseConnection()).materializeTransactions();
    ActiveRecordTestCase.SQLCounter.clearLog();
    await block();
    return [...ActiveRecordTestCase.SQLCounter.log];
  }

  static SQLCounter = class SQLCounter {
    static log: string[];
    static logAll: string[];

    static clearLog(): void {
      this.log = [];
      this.logAll = [];
    }

    static {
      this.clearLog();
    }

    call(
      _name: string,
      _start: unknown,
      _finish: unknown,
      _messageId: string,
      values: Record<string, unknown>,
    ): void {
      if (values.cached) return;

      const sql = values.sql as string;
      SQLCounter.logAll.push(sql);
      if (!["SCHEMA", "TRANSACTION"].includes(values.name as string)) SQLCounter.log.push(sql);
    }
  };

  static {
    Notifications.subscribe("sql.active_record", new ActiveRecordTestCase.SQLCounter());
  }
}

await ActiveRecordTestConnector.setup();
