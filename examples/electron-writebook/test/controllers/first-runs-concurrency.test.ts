import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatementTimeout } from "@blazetrails/activerecord";
import { ApplicationIntegrationTest, loadFixtures } from "../test-helper.ts";
import { Account } from "../../app/models/account.ts";
import { Book } from "../../app/models/book.ts";
import { User } from "../../app/models/user.ts";

describe("FirstRunsConcurrencyTest", () => {
  const destroyAll = async () => {
    await Book.destroyAll();
    await User.destroyAll();
    await Account.destroyAll();
  };

  beforeEach(async () => {
    await loadFixtures();
    await destroyAll();
  });

  afterEach(destroyAll);

  it("concurrent first runs create one account and one administrator", async () => {
    const requests = 5;

    // Each session posts in the same tick, which is what the CyclicBarrier lines
    // the threads up for.
    await Promise.all(
      Array.from({ length: requests }, async (_, i) => {
        const session = new ApplicationIntegrationTest(`first run ${i}`);
        try {
          await session.post("/first_run", {
            params: {
              user: {
                name: `Person ${i}`,
                email_address: `person${i}@example.com`,
                password: "secret123456",
              },
            },
          });
        } catch (error) {
          // A request can give up waiting on the winner's write lock. That's fine:
          // what matters is what got written, not how each loser was answered.
          if (!(error instanceof StatementTimeout)) throw error;
        }
      }),
    );

    expect(await Account.count()).toBe(1);
    expect(await User.administrator().count()).toBe(1);
  });
});
