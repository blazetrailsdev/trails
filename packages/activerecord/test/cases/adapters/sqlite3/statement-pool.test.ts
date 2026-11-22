import { describe, it } from "vitest";
import { currentAdapter } from "../../../support/adapter-helper.js";

describe.runIf(currentAdapter("SQLite3Adapter"))("SQLite3StatementPoolTest", () => {
  it.skip("cache is per pid", () => {});
});
