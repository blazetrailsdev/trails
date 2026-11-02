import { describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { Identification } from "@blazetrails/globalid";
import { isModuleIncluded } from "@blazetrails/ruby-compat";
import { Engine } from "./engine.js";
import { Model } from "./attached/model.js";
import { ActiveRecordExtensions } from "./reflection.js";
import "./test-helpers/database/setup.js";

describe("ActiveStorage::Engine", () => {
  it("includes the attachment modules and GlobalID::Identification into Base", () => {
    for (const mod of [Model, ActiveRecordExtensions, Identification]) {
      expect(isModuleIncluded(Base, mod)).toBe(true);
    }
  });

  it("finds its routes file through the config/routes.ts path", async () => {
    const routes = await Engine.config.paths().get("config/routes.ts")!.existent();
    expect(routes).toEqual([`${import.meta.dirname}/config/routes.ts`]);
  });
});
