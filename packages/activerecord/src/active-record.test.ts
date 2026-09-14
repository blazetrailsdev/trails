import { describe, it } from "vitest";
import { assertPredicate, assertNotPredicate } from "@blazetrails/activesupport";
import { Base, disconnectAllBang } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { inMemoryDb } from "./support/adapter-helper.js";

describe("ActiveRecordTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it.skipIf(inMemoryDb())(".disconnect_all! closes all connections", async () => {
    await (await Base.leaseConnection()).connectBang();
    assertPredicate(Base, (b) => b.connectedQ());

    await disconnectAllBang();
    assertNotPredicate(Base, (b) => b.connectedQ());

    await (await Base.leaseConnection()).connectBang();
    assertPredicate(Base, (b) => b.connectedQ());
  });
});
