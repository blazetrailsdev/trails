import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base, RecordNotDestroyed } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Account } from "../test-helpers/models/account.js";
import { Firm } from "../test-helpers/models/company.js";

type Destroyable = Base & { destroy(): Promise<Base | false>; destroyBang(): Promise<Base> };
type FirmInternals = { clientsOfFirm: { deleteAll(dependent?: string): Promise<number> } };

describe("association builder control flow", () => {
  const { accounts, companies } = fixtures(["accounts", "companies"]);

  it("destroy rescues a RecordNotDestroyed raised by any before_destroy callback", async () => {
    const error = new RecordNotDestroyed("not today");
    class GuardedAccount extends Account {
      static {
        this.beforeDestroy(() => {
          throw error;
        });
      }
    }
    const account = (await GuardedAccount.find(accounts("signals37").id)) as Destroyable;

    expect(await account.destroy()).toBe(false);
    expect(await account.destroyBang().catch((e: unknown) => e)).toBe(error);
    expect(await Account.isExists(accounts("signals37").id)).toBe(true);
  });

  it("delete_all rejects a dependent that is neither :nullify nor :delete_all", async () => {
    const firm = (await Firm.find(companies("first_firm").id)) as unknown as FirmInternals;

    const raised = await firm.clientsOfFirm.deleteAll("delete_all").catch((e: unknown) => e);
    expect(raised).toBeInstanceOf(ArgumentError);
    expect((raised as Error).message).toBe("Valid values are :nullify or :delete_all");
  });
});
