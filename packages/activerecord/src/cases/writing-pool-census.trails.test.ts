import { describe, it, expect, afterAll } from "vitest";
import { Base } from "../base.js";
import { writingPoolsLeakedSinceBaseline } from "./helper.js";
import { restoreWorkerConnection } from "../support/connection.js";

class CensusLeakModel extends Base {}
await CensusLeakModel.establishConnection({
  adapter: "sqlite3",
  database: ":memory:",
});

describe("writing pool census", () => {
  it("reports a pool established at module scope, naming its connection descriptor", () => {
    expect(writingPoolsLeakedSinceBaseline()).toEqual(["CensusLeakModel"]);
  });

  it("reports a baseline pool REPLACED by a different pool of the same name", async () => {
    try {
      await Base.establishConnection({ adapter: "sqlite3", database: "db/primary.sqlite3" });
      expect(writingPoolsLeakedSinceBaseline()).toEqual(
        expect.arrayContaining([expect.stringMatching(/^ActiveRecord::Base \(/)]),
      );
    } finally {
      await restoreWorkerConnection();
    }
    expect(writingPoolsLeakedSinceBaseline()).toEqual(["CensusLeakModel"]);
  });
});

afterAll(async () => {
  await CensusLeakModel.removeConnection();
});
