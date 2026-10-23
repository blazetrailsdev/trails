import { it, expect } from "vitest";
import { toEnum } from "@blazetrails/ruby-compat";
import { NullLogger } from "./null-logger.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

it("act as a noop logger", async () => {
  const app = async (env: Record<string, any>) => {
    env["rack.logger"].warn("b00m");
    return [200, { "content-type": "text/plain" }, ["Hello, World!"]] as [
      number,
      Record<string, string>,
      any,
    ];
  };

  const logger = new Lint(new NullLogger(app));

  const res = await logger.call(MockRequest.envFor());
  expect(res.slice(0, 2)).toEqual([200, { "content-type": "text/plain" }]);
  expect(await toEnum(res[2]).toA()).toEqual(["Hello, World!"]);
});
