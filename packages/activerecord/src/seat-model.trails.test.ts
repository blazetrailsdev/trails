import { constantize } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Base, seatModel } from "./index.js";

describe("seatModel", () => {
  const top = TopLevel as unknown as Record<string, unknown>;

  afterEach(() => {
    delete top.SeatedPost;
    delete top.SeatedAdmin;
  });

  it("seats a model on TopLevel", () => {
    class SeatedPost extends Base {}
    seatModel(SeatedPost);

    expect(constantize("SeatedPost")).toBe(SeatedPost);
    expect(Base.descendants).toContain(SeatedPost);
  });

  it("keeps a namespaced name", () => {
    class User extends Base {}
    Object.defineProperty(User, "name", { value: "SeatedAdmin::User" });
    seatModel(User);

    expect(constantize("SeatedAdmin::User")).toBe(User);
  });
});
