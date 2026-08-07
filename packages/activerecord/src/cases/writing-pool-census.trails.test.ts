import { describe, it, expect, afterAll } from "vitest";
import { Base } from "../base.js";
import { writingPoolsLeakedSinceBaseline } from "./helper.js";

// trails-only: Rails' `ActiveRecord::TestCase` tears its connections down per
// case, so no pool can outlive the file that opened it and Rails needs no
// census at all. trails' connection handler is module-level state shared by
// every test file in a vitest worker, so this guard stands in for that teardown
// — and this file is what proves it still catches the case it was tightened
// for: a pool established at a test file's MODULE scope. The baseline is taken
// at setup-module load (`test-setup-dy.ts`), before this body runs, so the pool
// below is charged here rather than absorbed into its own baseline.
class CensusLeakModel extends Base {}
await CensusLeakModel.establishConnection({
  adapter: "sqlite3",
  database: ":memory:",
});

describe("writing pool census", () => {
  it("reports a pool established at module scope, naming its connection descriptor", () => {
    expect(writingPoolsLeakedSinceBaseline()).toEqual(["CensusLeakModel"]);
  });
});

// Remove the pool the way a file with a module-scope establisher is expected
// to: without this, the real `afterAll` guard in `cases/helper.ts` fails this
// file, which is exactly the outcome the assertion above pins.
afterAll(async () => {
  await CensusLeakModel.removeConnection();
});
