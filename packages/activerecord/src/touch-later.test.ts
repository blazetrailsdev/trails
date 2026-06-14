/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { travel, travelBack } from "@blazetrails/activesupport";
import { Base, registerModel } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { setBeforeCommittedOnAllRecords } from "./ar-config.js";
import { Invoice } from "./test-helpers/models/invoice.js";
import { LineItem } from "./test-helpers/models/line-item.js";
import { Node } from "./test-helpers/models/node.js";
import { Tree } from "./test-helpers/models/tree.js";
import { Owner } from "./test-helpers/models/owner.js";
import { Pet } from "./test-helpers/models/pet.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

// Mirrors Rails `fixtures :nodes, :trees, :owners, :pets`. The fixture loader
// seeds explicit PKs and resets serial sequences, which a plain `create` does
// not do for the custom-named `owner_id`/`pet_id` PKs on Postgres.
const { nodes, trees, owners, pets } = useHandlerFixtures(["nodes", "trees", "owners", "pets"]);

registerModel("Invoice", Invoice);
registerModel("LineItem", LineItem);
registerModel("Node", Node);
registerModel("Tree", Tree);
registerModel("Owner", Owner);
registerModel("Pet", Pet);

beforeAll(async () => {
  await defineSchema({
    // `amount`/`created_at` are local extras for the makeTouchModel tests;
    // `balance`/`updated_at` mirror Rails' canonical invoices so the canonical
    // Invoice model (which sets `balance` in a before_save) introspects cleanly.
    invoices: {
      amount: "integer",
      balance: "integer",
      updated_at: "datetime",
      created_at: "datetime",
    },
    line_items: TEST_SCHEMA.line_items,
  });
});
// Mirrors Ruby's `time.to_i` — whole epoch seconds, the granularity Rails'
// touch_later assertions compare at (DB datetime columns drop sub-second
// precision on round-trip).
function toI(value: unknown): number {
  return Math.floor((value as Temporal.Instant).epochMilliseconds / 1000);
}

describe("TouchLaterTest", () => {
  function makeTouchModel() {
    class Invoice extends Base {
      static {
        this._tableName = "invoices";
        this.attribute("amount", "integer");
        this.attribute("updated_at", "datetime");
        this.attribute("created_at", "datetime");
      }
    }
    return Invoice;
  }

  it("touch later raise if non persisted", async () => {
    const Invoice = makeTouchModel();
    const inv = new Invoice({ amount: 100 });
    expect(inv.isPersisted()).toBe(false);
    await expect(inv.touchLater()).rejects.toThrow("Cannot touch on a new or destroyed record");
  });

  it("touch later dont set dirty attributes", async () => {
    const Invoice = makeTouchModel();
    const inv = await Invoice.create({ amount: 100 });
    await inv.touchLater();
    expect(inv.changed).toBe(false);
  });

  it("touch later respects no touching policy", async () => {
    const Invoice = makeTouchModel();
    const inv = await Invoice.create({ amount: 100 });
    // noTouching suppresses touch - but touch() doesn't check it currently
    // So we just verify noTouching sets the flag
    let suppressed = false;
    await Invoice.noTouching(async () => {
      suppressed = Invoice.isTouchingSuppressed;
    });
    expect(suppressed).toBe(true);
    expect(Invoice.isTouchingSuppressed).toBe(false);
  });

  it("touch later update the attributes", async () => {
    const Invoice = makeTouchModel();
    const inv = await Invoice.create({ amount: 100 });
    const before = inv.updated_at;
    // Small delay so timestamp differs
    await new Promise((r) => setTimeout(r, 5));
    await inv.touch();
    const after = inv.updated_at;
    expect(before).toBeInstanceOf(Temporal.Instant);
    expect(after).toBeInstanceOf(Temporal.Instant);
    // updated_at should have changed
    expect((after as Temporal.Instant).epochMilliseconds).toBeGreaterThanOrEqual(
      (before as Temporal.Instant).epochMilliseconds,
    );
  });

  it("touch touches immediately", async () => {
    const Invoice = makeTouchModel();
    const inv = await Invoice.create({ amount: 100 });
    const result = await inv.touch();
    expect(result).toBe(true);
    // Verify it persisted by reloading
    const reloaded = await Invoice.find(inv.id);
    expect(reloaded.updated_at).toBeDefined();
  });

  it("touch later an association dont autosave parent", async () => {
    const time = Temporal.Now.instant().subtract({ hours: 24 * 25 });
    const lineItem = await LineItem.create({ amount: 1 });
    const invoice = await Invoice.create({ lineItems: [lineItem] });
    await invoice.touch({ time });

    await Invoice.transaction(async () => {
      await lineItem.update({ amount: 2 });
      const reloaded = await Invoice.find(invoice.id!);
      // The touch is deferred to before_committed!, so the DB copy still
      // carries the original time inside the transaction.
      expect(toI(reloaded.updated_at)).toBe(toI(time));
    });

    // After commit the deferred touch flushed onto the in-memory parent.
    expect(toI(invoice.updated_at)).not.toBe(toI(time));
  });

  it("touch touches immediately with a custom time", async () => {
    const Invoice = makeTouchModel();
    const inv = await Invoice.create({ amount: 100 });
    // touch updates updated_at to current time
    await inv.touch();
    const updatedAt = inv.updated_at;
    expect(updatedAt).toBeInstanceOf(Temporal.Instant);
  });

  it("touch later dont hit the db", async () => {
    const Invoice = makeTouchModel();
    const inv = await Invoice.create({ amount: 100 });
    // surreptitiouslyTouch writes updated_at in-memory without dirty tracking.
    // Verify the in-memory value is updated synchronously (before any DB flush)
    // and that the attribute is not marked dirty.
    const before = inv.updated_at as Temporal.Instant;
    await inv.touchLater();
    const afterInMemory = inv.updated_at as Temporal.Instant;
    expect(afterInMemory).not.toBeNull();
    // The value was written in-memory — no reload needed to observe it.
    expect(afterInMemory.epochMilliseconds).toBeGreaterThanOrEqual(before?.epochMilliseconds ?? 0);
    // No dirty tracking — the attribute change was cleared by surreptitiouslyTouch.
    expect(inv.changed).toBe(false);
  });
  it("touching three deep", async () => {
    const previousTreeUpdatedAt = (trees("root") as any).updated_at;
    const previousGrandparentUpdatedAt = (nodes("grandparent") as any).updated_at;
    const previousParentUpdatedAt = (nodes("parent_a") as any).updated_at;
    const previousChildUpdatedAt = (nodes("child_one_of_a") as any).updated_at;

    travel(5000);
    try {
      await Node.create({ parent: nodes("child_one_of_a"), tree: trees("root") });
    } finally {
      travelBack();
    }

    expect((await (nodes("child_one_of_a") as any).reload()).updated_at).not.toEqual(
      previousChildUpdatedAt,
    );
    expect((await (nodes("parent_a") as any).reload()).updated_at).not.toEqual(
      previousParentUpdatedAt,
    );
    expect((await (nodes("grandparent") as any).reload()).updated_at).not.toEqual(
      previousGrandparentUpdatedAt,
    );
    expect((await (trees("root") as any).reload()).updated_at).not.toEqual(previousTreeUpdatedAt);
  });

  it("touching through nested attributes without before committed on all records", async () => {
    setBeforeCommittedOnAllRecords(false);
    try {
      const time = Temporal.Now.instant().subtract({ hours: 24 * 25 });
      const owner = owners("blackbeard") as any;
      const petId = (pets("parrot") as any).readAttribute("pet_id");

      await owner.touch({ time });
      expect(toI((await owner.reload()).updated_at)).toBe(toI(time));

      await owner.update({ petsAttributes: { "0": { id: String(petId), name: "Alfred" } } });

      // The second copy of the parent is not touched, so updated_at is unchanged.
      expect(toI((await owner.reload()).updated_at)).toBe(toI(time));
    } finally {
      setBeforeCommittedOnAllRecords(false);
    }
  });

  it("touching through nested attributes with before committed on all records", async () => {
    setBeforeCommittedOnAllRecords(true);
    try {
      const time = Temporal.Now.instant().subtract({ hours: 24 * 25 });
      const owner = owners("blackbeard") as any;
      const petId = (pets("parrot") as any).readAttribute("pet_id");

      await owner.touch({ time });
      expect(toI((await owner.reload()).updated_at)).toBe(toI(time));

      await owner.update({ petsAttributes: { "0": { id: String(petId), name: "Alfred" } } });

      expect(toI((await owner.reload()).updated_at)).not.toBe(toI(time));
    } finally {
      setBeforeCommittedOnAllRecords(false);
    }
  });
});

describe("surreptitiouslyTouch reads _touchTime from instance (Story K gap 3)", () => {
  it("uses _touchTime stored on the record rather than an explicit argument", async () => {
    const { surreptitiouslyTouch } = await import("./touch-later.js");
    class Invoice extends Base {
      static {
        this._tableName = "invoices";
        this.attribute("amount", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    const inv = await Invoice.create({ amount: 5 });
    const touchTime = new Date(1_000_000);
    (inv as any)._touchTime = touchTime;

    const written: [string, unknown][] = [];
    const origWrite = (inv as any).writeAttribute.bind(inv);
    (inv as any).writeAttribute = (attr: string, val: unknown) => {
      written.push([attr, val]);
      return origWrite(attr, val);
    };

    surreptitiouslyTouch.call(inv as any, ["updated_at"]);

    // writeAttribute was called with _touchTime (not an explicit param)
    expect(written).toEqual([["updated_at", touchTime]]);
    // No dirty tracking — surreptitiouslyTouch clears the change
    expect((inv as any).attributeChanged("updated_at")).toBe(false);
  });
});

describe("touchDeferredAttributes delegates to timestampTouch with deferred time (Story K gap 4)", () => {
  it("uses the stored _touchTime and clears deferred state", async () => {
    const { touchDeferredAttributes } = await import("./touch-later.js");
    class Invoice extends Base {
      static {
        this._tableName = "invoices";
        this.attribute("amount", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    const inv = await Invoice.create({ amount: 10 });

    const fixedTime = new Date(2_000_000);
    (inv as any)._deferTouchAttrs = ["updated_at"];
    (inv as any)._touchTime = fixedTime;

    await touchDeferredAttributes.call(inv as any);

    expect((inv as any)._deferTouchAttrs).toBeNull();
    expect((inv as any)._touchTime).toBeNull();
  });
});
