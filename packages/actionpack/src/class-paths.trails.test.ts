import { describe, expect, it } from "vitest";
import { rbModName } from "@blazetrails/ruby-compat";
import { ActionNotFound } from "./abstract-controller/base.js";
import { BadRequest } from "./action-controller/metal/exceptions.js";

describe("generated class paths under a deep import", () => {
  it("answers the rails-api.json fqn for a class with no seat", () => {
    expect(rbModName(ActionNotFound)).toBe("AbstractController::ActionNotFound");
    expect(rbModName(BadRequest)).toBe("ActionController::BadRequest");
  });
});
