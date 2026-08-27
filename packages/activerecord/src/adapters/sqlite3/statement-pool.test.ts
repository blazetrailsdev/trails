import { it } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";

describeIfSqlite("SQLite3StatementPoolTest", () => {
  it.skip("cache is per pid", () => {});
});
