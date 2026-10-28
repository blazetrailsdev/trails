import { describe, expect, it } from "vitest";
import { rbModName } from "@blazetrails/ruby-compat";
import { ActionDispatch } from "./namespaces.js";

describe("ActionDispatch autoload_under testing", () => {
  it("seats IntegrationTest, TestRequest and AssertionResponse at their Ruby paths", async () => {
    for (const name of ["IntegrationTest", "TestRequest", "AssertionResponse"] as const) {
      await ActionDispatch.loadPath[await ActionDispatch._autoloads![name]()]();
      expect(rbModName(ActionDispatch[name])).toBe(`ActionDispatch::${name}`);
    }
  });
});

describe("ActionDispatch::MissingController", () => {
  it("reads its Ruby path from its seat", async () => {
    const { MissingController } = await import("./action-dispatch/http/request.js");
    expect(new MissingController("x").name).toBe("ActionDispatch::MissingController");
  });
});
