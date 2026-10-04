import { describe, it, expect, vi } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base, RecordNotDestroyed } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Account } from "../test-helpers/models/account.js";
import { Firm } from "../test-helpers/models/company.js";
import { BelongsTo } from "./builder/belongs-to.js";
import { CollectionAssociation } from "./builder/collection-association.js";

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

  it("touch_record skips the old record when the foreign key is composite", async () => {
    const changes = new Hash<string | string[], unknown[]>();
    changes.set("author_id", [1, 2]);
    changes.set("id", [3, 4]);
    const o = { association: vi.fn(), book: null };

    await BelongsTo.touchRecord(o, changes, ["author_id", "id"], "book", true);

    expect(o.association).not.toHaveBeenCalled();
  });

  it("touch_record passes a non-true touch to touch_later as one argument", async () => {
    const touchLater = vi.fn();
    const o = { firm: { isPersisted: () => true, touchLater } };

    await BelongsTo.touchRecord(o, new Hash(), "firm_id", "firm", ["updated_at", "updated_on"]);

    expect(touchLater).toHaveBeenCalledWith(["updated_at", "updated_on"]);
  });

  it("define_callback replaces the callbacks a previous call assigned", () => {
    class Owner {}
    const first = vi.fn();
    const second = vi.fn();

    CollectionAssociation.defineCallback(Owner, "beforeAdd", "posts", { beforeAdd: first });
    CollectionAssociation.defineCallback(Owner, "beforeAdd", "posts", { beforeAdd: second });

    const callbacks = (Owner as unknown as { beforeAddForPosts: ((...args: unknown[]) => void)[] })
      .beforeAddForPosts;
    expect(callbacks).toHaveLength(1);
    callbacks[0]("beforeAdd", "owner", "record");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("owner", "record");
  });
});
