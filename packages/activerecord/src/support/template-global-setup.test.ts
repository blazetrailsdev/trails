import { describe, it, expect } from "vitest";
import { RUN_TOKEN_ENV } from "./sqlite-template.js";
import { scratchDatabasePath } from "./scratch-database.js";

const runToken = process.env[RUN_TOKEN_ENV];

describe("temp sqlite DB sweep arming", () => {
  it("stamps the run token regardless of the active lane", () => {
    expect(runToken).toBeTruthy();
  });

  it("stamps scratch database paths with the swept run token", async () => {
    expect(await scratchDatabasePath("global-setup-probe")).toContain(`-${runToken}-`);
  });
});
