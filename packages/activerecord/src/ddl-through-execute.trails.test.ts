import { describe, it, expect } from "vitest";

import { Base } from "./index.js";
import { ReadOnlyError } from "./errors.js";
import { fixtures } from "./test-fixtures.js";

describe("DDL through execute (trails)", () => {
  fixtures([], { useTransactionalTests: false });

  it("DDL raises if preventing writes", async () => {
    const conn = (await Base.leaseConnection()) as never as {
      addColumn(t: string, c: string, ty: string): Promise<void>;
    };
    const error = await Base.whilePreventingWrites(async () => {
      await conn.addColumn("posts", "readonlyDdlProbe", "string");
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: ALTER TABLE /,
    );
  });
});
