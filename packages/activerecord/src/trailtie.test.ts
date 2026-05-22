import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, type ActiveRecordConfig } from "./trailtie.js";
import { Base } from "./base.js";
import { Railtie as BaseRailtie, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { SchemaReflection } from "./connection-adapters/schema-cache.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";
import { Configurable as EncryptionConfigurable } from "./encryption/configurable.js";
import { deprecator } from "./deprecator.js";

const { deprecators } = BaseRailtie;

describe("RailtieTest", () => {
  let savedSubclasses: (typeof BaseRailtie)[];
  let savedConfig: ActiveRecordConfig;
  let savedTimeZoneAware: boolean;
  let savedTimeZoneAwareTypes: string[];
  let savedUseSchemaCacheDump: boolean;
  let savedCheckSchemaCacheDumpVersion: boolean;
  let savedStrictStrings: boolean;
  let savedDecodeDates: boolean;
  let savedEncryptionSupportUnencryptedData: boolean;

  beforeEach(() => {
    savedSubclasses = [...BaseRailtie.subclasses];
    savedConfig = structuredClone(Trailtie.config["activeRecord"] as ActiveRecordConfig);
    savedTimeZoneAware = Base.timeZoneAwareAttributes;
    savedTimeZoneAwareTypes = [...Base.timeZoneAwareTypes];
    savedUseSchemaCacheDump = SchemaReflection.useSchemaCacheDump;
    savedCheckSchemaCacheDumpVersion = SchemaReflection.checkSchemaCacheDumpVersion;
    savedStrictStrings = SQLite3Adapter.strictStringsByDefault;
    savedDecodeDates = PostgreSQLAdapter.decodeDates;
    savedEncryptionSupportUnencryptedData = EncryptionConfigurable.config.supportUnencryptedData;

    // Simulate a fresh app boot for each test: clear the load-hook registry
    // and re-emit the load events that base.ts / the adapter files would
    // fire at module-import time in a real app.
    resetLoadHooks();
    runLoadHooks("active_record", Base);
    runLoadHooks("active_record_postgresqladapter", PostgreSQLAdapter);
    runLoadHooks("active_record_sqlite3adapter", SQLite3Adapter);
  });

  afterEach(() => {
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).length = 0;
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).push(...savedSubclasses);
    Trailtie.config["activeRecord"] = savedConfig;
    Base.timeZoneAwareAttributes = savedTimeZoneAware;
    Base.timeZoneAwareTypes = savedTimeZoneAwareTypes;
    SchemaReflection.useSchemaCacheDump = savedUseSchemaCacheDump;
    SchemaReflection.checkSchemaCacheDumpVersion = savedCheckSchemaCacheDumpVersion;
    SQLite3Adapter.strictStringsByDefault = savedStrictStrings;
    PostgreSQLAdapter.decodeDates = savedDecodeDates;
    EncryptionConfigurable.config.supportUnencryptedData = savedEncryptionSupportUnencryptedData;
    for (const key of Object.keys(deprecators)) {
      delete deprecators[key];
    }
  });

  it("ActiveRecord::Railtie is registered in the global subclasses list", () => {
    expect(BaseRailtie.subclasses).toContain(Trailtie);
  });

  it("runInitializers registers the ActiveRecord deprecator", () => {
    Trailtie.runInitializers();
    expect(deprecators["activeRecord"]).toBe(deprecator());
  });

  it("seeds config.activeRecord with the Rails default OrderedOptions block", () => {
    const cfg = Trailtie.config["activeRecord"] as ActiveRecordConfig;
    expect(cfg.useSchemaCacheDump).toBe(true);
    expect(cfg.checkSchemaCacheDumpVersion).toBe(true);
    expect(cfg.maintainTestSchema).toBe(true);
    expect(cfg.hasManyInversing).toBe(false);
    expect(cfg.queryLogTagsEnabled).toBe(false);
    expect(cfg.queryLogTags).toEqual(["application"]);
    expect(cfg.queryLogTagsFormat).toBe("legacy");
    expect(cfg.cacheQueryLogTags).toBe(false);
    expect(cfg.raiseOnAssignToAttrReadonly).toBe(false);
    expect(cfg.belongsToRequiredValidatesForeignKey).toBe(true);
    expect(cfg.generateSecureTokenOn).toBe("create");
    expect(cfg.encryption).toEqual({});
    expect(cfg.queues).toEqual({});
  });

  it("runInitializers enables time_zone_aware_attributes on Base", () => {
    Base.timeZoneAwareAttributes = false;
    Trailtie.runInitializers();
    expect(Base.timeZoneAwareAttributes).toBe(true);
  });

  it("runInitializers adds timestamptz to time_zone_aware_types once the postgresql adapter is loaded", () => {
    Base.timeZoneAwareTypes = ["datetime", "time"];
    Trailtie.runInitializers();
    // beforeEach re-emits `runLoadHooks("active_record_postgresqladapter", ...)`
    // and `("active_record", ...)`, so the nested on_load fires synchronously.
    expect(Base.timeZoneAwareTypes).toContain("timestamptz");
  });

  it("runInitializers copies schema cache flags to SchemaReflection", () => {
    const cfg = Trailtie.config["activeRecord"] as ActiveRecordConfig;
    cfg.useSchemaCacheDump = false;
    cfg.checkSchemaCacheDumpVersion = false;
    Trailtie.runInitializers();
    expect(SchemaReflection.useSchemaCacheDump).toBe(false);
    expect(SchemaReflection.checkSchemaCacheDumpVersion).toBe(false);
  });

  it("runInitializers copies sqlite3 strict strings flag onto SQLite3Adapter", () => {
    const cfg = Trailtie.config["activeRecord"] as ActiveRecordConfig;
    cfg.sqlite3AdapterStrictStringsByDefault = true;
    Trailtie.runInitializers();
    expect(SQLite3Adapter.strictStringsByDefault).toBe(true);
  });

  it("runInitializers copies postgresql decode_dates flag onto PostgreSQLAdapter", () => {
    const cfg = Trailtie.config["activeRecord"] as ActiveRecordConfig;
    cfg.postgresqlAdapterDecodeDates = true;
    PostgreSQLAdapter.decodeDates = false;
    Trailtie.runInitializers();
    expect(PostgreSQLAdapter.decodeDates).toBe(true);
  });

  it("does not assign PostgreSQLAdapter.decodeDates when flag is absent (preserves prior value)", () => {
    const cfg = Trailtie.config["activeRecord"] as ActiveRecordConfig;
    delete cfg.postgresqlAdapterDecodeDates;
    // Use a non-default value so a faulty initializer that always assigns
    // `true` would visibly overwrite this.
    PostgreSQLAdapter.decodeDates = false;
    Trailtie.runInitializers();
    expect(PostgreSQLAdapter.decodeDates).toBe(false);
  });

  it("runInitializers forwards config.encryption to Encryption.Configurable", () => {
    const cfg = Trailtie.config["activeRecord"] as ActiveRecordConfig;
    cfg.encryption = { supportUnencryptedData: true };
    Trailtie.runInitializers();
    expect(EncryptionConfigurable.config.supportUnencryptedData).toBe(true);
  });
});
