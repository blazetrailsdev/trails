import { describe, it } from "vitest";

describe("LiveSmokeTest", () => {
  // PERMANENT-SKIP: these dial example.com over the public internet behind `LIVE=1` (live_smoke_test.rb:26-28); the suite is offline.
  it.skip("proxies to real http host", () => {});
  it.skip("default verify peer accepts valid public cert", () => {});
});
