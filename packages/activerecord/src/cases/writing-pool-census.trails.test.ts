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

  it("does not report a shard cleanUpConnectionHandler keeps on ActiveRecord::Base", async () => {
    const dbConfig = Base.configurations().configsFor({ envName: "arunit", name: "primary" });
    try {
      await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
        await Base.establishConnection(dbConfig);
      });
      expect(writingPoolsLeakedSinceBaseline()).toEqual(["CensusLeakModel"]);
    } finally {
      await Base.connectionHandler.removeConnectionPool("ActiveRecord::Base", {
        role: "writing",
        shard: "shard_one",
      });
    }
  });
});

afterAll(async () => {
  await CensusLeakModel.removeConnection();
});
