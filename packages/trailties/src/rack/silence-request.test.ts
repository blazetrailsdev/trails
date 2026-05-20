import { it, expect } from "vitest";
import { SilenceRequest } from "./silence-request.js";
import type { RackApp } from "@blazetrails/rack";

it("silence request only to specific path", async () => {
  const calls: Array<number | string> = [];
  const logger = {
    silence(_level: number | string, fn: () => void) {
      calls.push("silence");
      fn();
    },
  };

  const app: RackApp = async (env: Record<string, unknown>) => [
    200,
    env as Record<string, string>,
    [] as any,
  ];

  const middleware = new SilenceRequest(app, { path: "/up", logger });

  await middleware.call({ PATH_INFO: "/up" });
  await middleware.call({ PATH_INFO: "/down" });

  expect(calls).toEqual(["silence"]);
});
