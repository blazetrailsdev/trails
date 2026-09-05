import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, type ActiveRecordConfig } from "./active-record.js";
import { Base } from "@blazetrails/activerecord";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { SchemaReflection } from "@blazetrails/activerecord";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import { PostgreSQLAdapter } from "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import { Configurable as EncryptionConfigurable } from "@blazetrails/activerecord/encryption";
import { ExtendedDeterministicUniquenessValidator } from "@blazetrails/activerecord";
import { installExtendedQueriesIfConfigured } from "@blazetrails/activerecord/encryption/install";
import { UniquenessValidator } from "@blazetrails/activerecord";
import { deprecator } from "@blazetrails/activerecord";
import { ActiveRecord } from "@blazetrails/activerecord";
import { Deprecators, Executor } from "@blazetrails/activesupport";

const blogApp = (): {
  config: { filterParameters: Array<string | RegExp> };
  deprecators: Deprecators;
} => ({
  deprecators: new Deprecators(),
  config: { filterParameters: [] },
});

describe("RailtieTest", () => {
  let savedConfig: ActiveRecordConfig;
  let savedTimeZoneAware: boolean;
  let savedTimeZoneAwareTypes: string[];
  let savedUseSchemaCacheDump: boolean;
  let savedCheckSchemaCacheDumpVersion: boolean;
  let savedStrictStrings: boolean;
  let savedDecodeDates: boolean;
  let savedEncryptionSupportUnencryptedData: boolean;
  let savedPartialInserts: boolean;
  let savedRaiseOnAssignToAttrReadonly: boolean;
  let savedExtendQueries: boolean;
  let savedAddToFilterParameters: boolean;

  beforeEach(() => {
    savedConfig = structuredClone(Trailtie.config.get("activeRecord") as ActiveRecordConfig);
    savedTimeZoneAware = Base.timeZoneAwareAttributes;
    savedTimeZoneAwareTypes = [...Base.timeZoneAwareTypes];
    savedUseSchemaCacheDump = SchemaReflection.useSchemaCacheDump;
    savedCheckSchemaCacheDumpVersion = SchemaReflection.checkSchemaCacheDumpVersion;
    savedStrictStrings = SQLite3Adapter.strictStringsByDefault;
    savedDecodeDates = PostgreSQLAdapter.decodeDates;
    savedAddToFilterParameters = EncryptionConfigurable.config.addToFilterParameters;
    savedEncryptionSupportUnencryptedData = EncryptionConfigurable.config.supportUnencryptedData;
    savedPartialInserts = Base.partialInserts;
    savedRaiseOnAssignToAttrReadonly = ActiveRecord.raiseOnAssignToAttrReadonly;
    savedExtendQueries = EncryptionConfigurable.config.extendQueries;

    resetLoadHooks();
    runLoadHooks("active_record", Base);
    runLoadHooks("active_record_postgresqladapter", PostgreSQLAdapter);
    runLoadHooks("active_record_sqlite3adapter", SQLite3Adapter);
  });

  afterEach(() => {
    Trailtie.config.set("activeRecord", savedConfig);
    Base.timeZoneAwareAttributes = savedTimeZoneAware;
    Base.timeZoneAwareTypes = savedTimeZoneAwareTypes;
    SchemaReflection.useSchemaCacheDump = savedUseSchemaCacheDump;
    SchemaReflection.checkSchemaCacheDumpVersion = savedCheckSchemaCacheDumpVersion;
    SQLite3Adapter.strictStringsByDefault = savedStrictStrings;
    PostgreSQLAdapter.decodeDates = savedDecodeDates;
    EncryptionConfigurable.config.supportUnencryptedData = savedEncryptionSupportUnencryptedData;
    Base.partialInserts = savedPartialInserts;
    ActiveRecord.raiseOnAssignToAttrReadonly = savedRaiseOnAssignToAttrReadonly;
    EncryptionConfigurable.config.addToFilterParameters = savedAddToFilterParameters;
    EncryptionConfigurable.config.extendQueries = savedExtendQueries;
    installExtendedQueriesIfConfigured();
  });

  it("ActiveRecord::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers registers the ActiveRecord deprecator", async () => {
    const app = blogApp();
    await runTrailtieInitializers(Trailtie, app);
    expect(app.deprecators.get("activeRecord")).toBe(deprecator());
  });

  it("seeds config.activeRecord with the Rails default OrderedOptions block", () => {
    const cfg = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
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

  it("runInitializers enables time_zone_aware_attributes on Base", async () => {
    Base.timeZoneAwareAttributes = false;
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(Base.timeZoneAwareAttributes).toBe(true);
  });

  it("runInitializers adds timestamptz to time_zone_aware_types once the postgresql adapter is loaded", async () => {
    Base.timeZoneAwareTypes = ["datetime", "time"];
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(Base.timeZoneAwareTypes).toContain("timestamptz");
  });

  it("runInitializers copies schema cache flags to SchemaReflection", async () => {
    const cfg = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
    cfg.useSchemaCacheDump = false;
    cfg.checkSchemaCacheDumpVersion = false;
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(SchemaReflection.useSchemaCacheDump).toBe(false);
    expect(SchemaReflection.checkSchemaCacheDumpVersion).toBe(false);
  });

  it("runInitializers copies sqlite3 strict strings flag onto SQLite3Adapter", async () => {
    const cfg = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
    cfg.sqlite3AdapterStrictStringsByDefault = true;
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(SQLite3Adapter.strictStringsByDefault).toBe(true);
  });

  it("runInitializers copies postgresql decode_dates flag onto PostgreSQLAdapter", async () => {
    const cfg = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
    cfg.postgresqlAdapterDecodeDates = true;
    PostgreSQLAdapter.decodeDates = false;
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(PostgreSQLAdapter.decodeDates).toBe(true);
  });

  it("does not assign PostgreSQLAdapter.decodeDates when flag is absent (preserves prior value)", async () => {
    const cfg = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
    delete cfg.postgresqlAdapterDecodeDates;
    PostgreSQLAdapter.decodeDates = false;
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(PostgreSQLAdapter.decodeDates).toBe(false);
  });

  it("runInitializers forwards config.encryption to Encryption.Configurable", async () => {
    const cfg = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
    cfg.encryption = { supportUnencryptedData: true };
    await runTrailtieInitializers(Trailtie, blogApp());
    expect(EncryptionConfigurable.config.supportUnencryptedData).toBe(true);
  });

  it("runInitializers enables auto filtered parameters when add_to_filter_parameters is set", async () => {
    const app = {
      deprecators: new Deprecators(),
      config: { filterParameters: [] as Array<string | RegExp> },
    };
    EncryptionConfigurable.config.addToFilterParameters = true;

    await runTrailtieInitializers(Trailtie, app);
    EncryptionConfigurable.encryptedAttributeWasDeclared(class Person {}, "name");

    expect(app.config.filterParameters).toContain("person.name");
  });

  it("runInitializers does not enable auto filtered parameters when add_to_filter_parameters is unset", async () => {
    const app = {
      deprecators: new Deprecators(),
      config: { filterParameters: [] as Array<string | RegExp> },
    };
    EncryptionConfigurable.config.addToFilterParameters = false;

    await runTrailtieInitializers(Trailtie, app);
    EncryptionConfigurable.encryptedAttributeWasDeclared(class Person {}, "name");

    expect(app.config.filterParameters).toEqual([]);
  });

  it("runInitializers installs extended deterministic query support when extend_queries is set", async () => {
    ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);
    EncryptionConfigurable.config.extendQueries = true;

    await runTrailtieInitializers(Trailtie, blogApp());
    runLoadHooks("active_record", Base);

    expect(ExtendedDeterministicUniquenessValidator.installed).toBe(true);
  });

  it("runInitializers does not install extended deterministic query support when extend_queries is unset", async () => {
    ExtendedDeterministicUniquenessValidator.resetSupport(UniquenessValidator);
    EncryptionConfigurable.config.extendQueries = false;

    await runTrailtieInitializers(Trailtie, blogApp());
    runLoadHooks("active_record", Base);

    expect(ExtendedDeterministicUniquenessValidator.installed).toBe(false);
  });

  it("runInitializers installs the executor hooks that open an async query session", async () => {
    await runTrailtieInitializers(Trailtie, blogApp());

    expect(() => Base.asynchronousQueriesTracker().currentSession).toThrow(
      "Can't perform asynchronous queries without a query session",
    );

    Executor.wrap(() => {
      expect(Base.asynchronousQueriesTracker().currentSession.active()).toBe(true);
    });

    expect(() => Base.asynchronousQueriesTracker().currentSession).toThrow(
      "Can't perform asynchronous queries without a query session",
    );
  });
});
