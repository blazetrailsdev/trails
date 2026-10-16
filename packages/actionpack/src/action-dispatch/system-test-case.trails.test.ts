import { describe, it, expect } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { SystemTestCase } from "./system-test-case.js";
import { Server, vite } from "./system-testing/server.js";

const trails = TopLevel.Trails;
TopLevel.Trails = {
  ...trails,
  application: async () => [200, {}, ["from application"]],
} as unknown as typeof TopLevel.Trails;
Server.silencePuma = true;
try {
  await SystemTestCase.startApplication();
} finally {
  Server.silencePuma = false;
  TopLevel.Trails = trails;
}

describe("SystemTestCase.startApplication", () => {
  it("mounts the application under / and serves it from the Vite dev server", async () => {
    const response = await fetch(new URL("posts", vite.url));
    expect(await response.text()).toBe("from application");
  });
});
