import "./abstract-unit.js";
import { Base } from "@blazetrails/activerecord";
import { cattrAccessor, isBlank } from "@blazetrails/activesupport";
import { Dir, File, getFs, warn } from "@blazetrails/ruby-compat";

const __dir__ = new URL(".", import.meta.url).pathname;

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
    const defaults = { database: ":memory:" };
    const options = { ...defaults, adapter: "sqlite3", timeout: 500 };
    await Base.establishConnection(options);
    Base.configurations({ sqlite3_ar_integration: options });
    await Base.leaseConnection();
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

await ActiveRecordTestConnector.setup();
