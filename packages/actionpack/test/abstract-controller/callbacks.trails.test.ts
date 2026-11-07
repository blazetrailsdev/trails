import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Base } from "../../lib/abstract-controller/base.js";
import { Callbacks } from "../../lib/abstract-controller/callbacks.js";

class Answering extends Base {
  index(): string {
    return "answered";
  }
}
include(Answering, Callbacks);

describe("Callbacks#process_action", () => {
  it("answers the action's value through run_callbacks", async () => {
    expect(await new Answering().process("index")).toBe("answered");
  });
});
