import { describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { Identification } from "@blazetrails/globalid";
import { isModuleIncluded } from "@blazetrails/ruby-compat";
import { Model } from "./attached/model.js";
import { ActiveRecordExtensions } from "./reflection.js";
import "./test-helpers/database/setup.js";

describe("ActiveStorage::Engine", () => {
  it("includes the attachment modules and GlobalID::Identification into Base", () => {
    for (const mod of [Model, ActiveRecordExtensions, Identification]) {
      expect(isModuleIncluded(Base, mod)).toBe(true);
    }
  });
});
