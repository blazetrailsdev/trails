import { currentAdapter } from "../../../support/adapter-helper.js";
import { describe, it } from "vitest";

describe.runIf(currentAdapter("SQLite3Adapter"))("SQLite3StatementPoolTest", () => {
  it.skip("cache is per pid", () => {});
});
