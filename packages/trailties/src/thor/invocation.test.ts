import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import type { Invocation } from "./invocation.js";
import { Thor } from "./thor.js";

class A extends Thor {}

describe("Thor::Invocation", () => {
  describe("#invoke", () => {
    it("raises an error if a non Thor class is given", async () => {
      await expect((new A() as unknown as Invocation).invoke(Object)).rejects.toThrow(
        new RuntimeError("Expected Thor class, got Object"),
      );
    });
  });
});
