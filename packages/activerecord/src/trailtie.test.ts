import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, type ActiveRecordConfig } from "./trailtie.js";
import { Base } from "./base.js";
import { Railtie as BaseRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

const { deprecators } = BaseRailtie;

describe("RailtieTest", () => {
  let savedSubclasses: (typeof BaseRailtie)[];
  let savedConfig: ActiveRecordConfig;
  let savedTimeZoneAware: boolean;

  beforeEach(() => {
    savedSubclasses = [...BaseRailtie.subclasses];
    savedConfig = structuredClone(Trailtie.config["activeRecord"] as ActiveRecordConfig);
    savedTimeZoneAware = Base.timeZoneAwareAttributes;
  });

  afterEach(() => {
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).length = 0;
    (BaseRailtie.subclasses as (typeof BaseRailtie)[]).push(...savedSubclasses);
    Trailtie.config["activeRecord"] = savedConfig;
    Base.timeZoneAwareAttributes = savedTimeZoneAware;
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
});
