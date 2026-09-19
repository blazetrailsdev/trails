import { describe, it, expect } from "vitest";

import { Base } from "./index.js";
import { assertRaises } from "@blazetrails/activesupport";
import { ReadOnlyError } from "./errors.js";
import { fixtures } from "./test-fixtures.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";
import { Bird } from "./test-helpers/models/bird.js";
import { Professor } from "./test-helpers/models/professor.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { assertQueriesCount } from "./testing/query-assertions.js";

describe.skipIf(inMemoryDb())("BasePreventWritesTest", () => {
  fixtures([]);

  it("creating a record raises if preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      const error = await assertRaises([ReadOnlyError], {}, () =>
        Bird.createBang({ name: "Bluejay" }),
      );

      expect(error.message).toMatch(/^Write query attempted while in readonly mode: INSERT /);
    });
  });

  it("updating a record raises if preventing writes", async () => {
    const bird = await Bird.createBang({ name: "Bluejay" });

    await Base.whilePreventingWrites(async () => {
      const error = await assertRaises([ReadOnlyError], {}, () =>
        bird.updateBang({ name: "Robin" }),
      );

      expect(error.message).toMatch(/^Write query attempted while in readonly mode: UPDATE /);
    });
  });

  it("deleting a record raises if preventing writes", async () => {
    const bird = await Bird.createBang({ name: "Bluejay" });

    await Base.whilePreventingWrites(async () => {
      const error = await assertRaises([ReadOnlyError], {}, () => bird.destroyBang());

      expect(error.message).toMatch(/^Write query attempted while in readonly mode: DELETE /);
    });
  });

  it("selecting a record does not raise if preventing writes", async () => {
    const bird = await Bird.createBang({ name: "Bluejay" });

    await Base.whilePreventingWrites(async () => {
      expect((await Bird.where({ name: "Bluejay" }).last())!.id).toBe(bird.id);
    });
  });

  it("an explain query does not raise if preventing writes", async () => {
    await Bird.createBang({ name: "Bluejay" });

    await Base.whilePreventingWrites(async () => {
      await assertQueriesCount(2, false, async () => {
        await Bird.where({ name: "Bluejay" }).explain().inspect();
      });
    });
  });

  it("an empty transaction does not raise if preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await assertQueriesCount(2, true, async () => {
        await Bird.transaction(async () => {
          await (await Base.leaseConnection()).materializeTransactions();
        });
      });
    });
  });

  it("preventing writes applies to all connections in block", async () => {
    await Base.whilePreventingWrites(async () => {
      const conn1Error = await assertRaises([ReadOnlyError], {}, async () => {
        expect(await Base.leaseConnection()).toBe(await Bird.leaseConnection());
        expect(await ARUnit2Model.leaseConnection()).not.toBe(await Bird.leaseConnection());
        await Bird.createBang({ name: "Bluejay" });
      });

      expect(conn1Error.message).toMatch(/^Write query attempted while in readonly mode: INSERT /);
    });

    await Base.whilePreventingWrites(async () => {
      const conn2Error = await assertRaises([ReadOnlyError], {}, async () => {
        expect(await Base.leaseConnection()).not.toBe(await Professor.leaseConnection());
        expect(await ARUnit2Model.leaseConnection()).toBe(await Professor.leaseConnection());
        await Professor.createBang({ name: "Professor Bluejay" });
      });

      expect(conn2Error.message).toMatch(/^Write query attempted while in readonly mode: INSERT /);
    });
  });

  it("current_preventing_writes", async () => {
    await Base.whilePreventingWrites(async () => {
      expect(Base.currentPreventingWrites()).toBeTruthy();
    });
  });
});
