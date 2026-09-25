import { describe, it, expect } from "vitest";
import * as ActiveModel from "@blazetrails/activemodel";
import { Trailtie } from "./active-model.js";

describe("ActiveModel::Railtie class body", () => {
  it("pushes ActiveModel onto the shared eager-load namespace list", () => {
    expect(Trailtie.config.eagerLoadNamespaces).toContain(ActiveModel);
  });
});
