import { beforeAll, describe, it, expect } from "vitest";

import { Base } from "./index.js";
import { ReadOnlyError } from "./errors.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { isSqliteRun } from "./support/sqlite-template.js";
import { resolveSecondDatabaseConfig } from "./support/arunit2-config.js";
import { rebuildCanonicalTables } from "./support/canonical-schema.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";
import { Professor } from "./test-helpers/models/professor.js";

describe("BasePreventWritesTest", () => {
  fixtures([]);

  class Bird extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  it("creating a record raises if preventing writes", async () => {
    const error = await Base.whilePreventingWrites(async () => {
      await Bird.create({ name: "Bluejay" });
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: INSERT /,
    );
  });

  it("updating a record raises if preventing writes", async () => {
    const bird = await Bird.create({ name: "Bluejay" });
    const error = await Base.whilePreventingWrites(async () => {
      await bird.update({ name: "Robin" });
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: UPDATE /,
    );
  });

  it("deleting a record raises if preventing writes", async () => {
    const bird = await Bird.create({ name: "Bluejay" });
    const error = await Base.whilePreventingWrites(async () => {
      await bird.destroy();
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: DELETE /,
    );
  });

  it("selecting a record does not raise if preventing writes", async () => {
    const bird = await Bird.create({ name: "Bluejay" });
    let found: Bird | null = null;
    await Base.whilePreventingWrites(async () => {
      found = await Bird.where({ name: "Bluejay" }).last();
    });
    expect(found).not.toBeNull();
    expect((found as unknown as Bird).id).toBe(bird.id);
  });

  it("an explain query does not raise if preventing writes", async () => {
    await Bird.create({ name: "Bluejay" });
    await Base.whilePreventingWrites(async () => {
      const result = await Bird.where({ name: "Bluejay" }).explain();
      expect(typeof result).toBe("string");
    });
  });

  it("an empty transaction does not raise if preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await Bird.transaction(async () => {});
    });
  });

  // Rails runs this against two real databases (arunit / arunit2). Like
  // MultipleDbTest, we reproduce the split with a second in-memory SQLite pool
  // on ARUnit2Model; the PG/MySQL suites don't provision a second named
  // database, so gate to SQLite.
  beforeAll(async () => {
    if (isSqliteRun() && !ARUnit2Model.connectionClassQ()) {
      await ARUnit2Model.establishConnection(resolveSecondDatabaseConfig().config);
    }
  });

  it.skipIf(!isSqliteRun())("preventing writes applies to all connections in block", async () => {
    await rebuildCanonicalTables(ARUnit2Model.connection, ["professors"]);

    const conn1Error = await Base.whilePreventingWrites(async () => {
      expect(await Bird.leaseConnection()).toBe(await Base.leaseConnection());
      expect(await ARUnit2Model.leaseConnection()).not.toBe(await Bird.leaseConnection());
      await Bird.create({ name: "Bluejay" });
    }).catch((e) => e);
    expect(conn1Error).toBeInstanceOf(ReadOnlyError);
    expect((conn1Error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: INSERT /,
    );

    const conn2Error = await Base.whilePreventingWrites(async () => {
      expect(await Professor.leaseConnection()).not.toBe(await Base.leaseConnection());
      expect(await ARUnit2Model.leaseConnection()).toBe(await Professor.leaseConnection());
      await Professor.create({ name: "Professor Bluejay" });
    }).catch((e) => e);
    expect(conn2Error).toBeInstanceOf(ReadOnlyError);
    expect((conn2Error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: INSERT /,
    );
  });

  it("current_preventing_writes", () => {
    expect(Base.currentPreventingWrites()).toBe(false);
    Base.whilePreventingWrites(() => {
      expect(Base.currentPreventingWrites()).toBe(true);
    });
    expect(Base.currentPreventingWrites()).toBe(false);
  });
});
