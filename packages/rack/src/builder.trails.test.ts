import { it, expect } from "vitest";
import { Builder } from "./builder.js";
import { MockRequest } from "./mock-request.js";

it("raises if #run provided both app and block", () => {
  const builder = new Builder();
  expect(() =>
    (builder as any).run(
      async () => [200, {}, []],
      async () => [200, {}, []],
    ),
  ).toThrow();
});

it("handles builder with no middleware and just run", async () => {
  const builder = new Builder();
  builder.run(async () => [200, {}, ["simple"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.body).toBe("simple");
});
