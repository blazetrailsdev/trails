import { describe, it, expect } from "vitest";
import { Railtie as BaseRailtie } from "@blazetrails/activesupport";
import { GlobalID } from "./global-id.js";
import "./trailtie.js";

describe("GlobalID::Railtie class body", () => {
  it("pushes GlobalID onto the shared eager-load namespace list", () => {
    expect(BaseRailtie.config["eagerLoadNamespaces"]).toContain(GlobalID);
  });

  it("seeds the config.global_id namespace before any initializer runs", () => {
    expect(BaseRailtie.config["globalId"]).toBeDefined();
  });
});
