import { describe, expect, it } from "vitest";
import { Builder } from "./builder.js";

describe("Builder#run", () => {
  it("runs an object that answers call", async () => {
    const app = { call: async () => [200, {}, ["OK"]] as [number, object, string[]] };
    const response = await new Builder().run(app).call({});
    expect(response[0]).toBe(200);
  });
});
