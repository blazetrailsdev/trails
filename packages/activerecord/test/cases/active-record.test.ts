import { describe, it } from "vitest";
import { assertPredicate, assertNotPredicate } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "../../lib/index.js";
import { disconnectAllBang } from "../../lib/active-record.js";
import { fixtures } from "../support/use-fixtures.js";
import { inMemoryDb } from "../support/adapter-helper.js";

describe("ActiveRecordTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it.skipIf(inMemoryDb())(".disconnect_all! closes all connections", async () => {
    await (await Base.leaseConnection()).connectBang();
    assertPredicate(Base, (b) => b.isConnected());

    await disconnectAllBang();
    assertNotPredicate(Base, (b) => b.isConnected());

    await (await Base.leaseConnection()).connectBang();
    assertPredicate(Base, (b) => b.isConnected());
  });
});
