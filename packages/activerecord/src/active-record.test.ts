import { describe, it } from "vitest";
import { assertPredicate, assertNotPredicate } from "@blazetrails/activesupport";
import { Base, disconnectAllBang } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { inMemoryDb } from "./support/adapter-helper.js";

describe("ActiveRecordTest", () => {
  // Rails: `self.use_transactional_tests = false` (active_record_test.rb).
  fixtures({}, { useTransactionalTests: false });

  // Rails gates this behind `unless in_memory_db?`: disconnecting an
  // in-memory SQLite database discards its schema.
  it.skipIf(inMemoryDb())(".disconnect_all! closes all connections", async () => {
    await (await Base.leaseConnection()).connectBang();
    assertPredicate(Base, (b) => b.connectedQ());

    await disconnectAllBang();
    assertNotPredicate(Base, (b) => b.connectedQ());

    await (await Base.leaseConnection()).connectBang();
    assertPredicate(Base, (b) => b.connectedQ());
  });
});
