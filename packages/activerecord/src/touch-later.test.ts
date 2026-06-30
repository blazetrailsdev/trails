/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Ported from vendor/rails/activerecord/test/cases/touch_later_test.rb.
 */
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { travel, travelBack } from "@blazetrails/activesupport";
import { registerModel } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { setBeforeCommittedOnAllRecords } from "./ar-config.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { Invoice } from "./test-helpers/models/invoice.js";
import { LineItem } from "./test-helpers/models/line-item.js";
import { Node } from "./test-helpers/models/node.js";
import { Tree } from "./test-helpers/models/tree.js";
import { Owner } from "./test-helpers/models/owner.js";
import { Pet } from "./test-helpers/models/pet.js";
import { Topic } from "./test-helpers/models/topic.js";

// Mirrors Rails `fixtures :nodes, :trees, :owners, :pets`. The fixture loader
// seeds explicit PKs and resets serial sequences, which a plain `create` does
// not do for the custom-named `owner_id`/`pet_id` PKs on Postgres.
const { nodes, trees, owners, pets } = fixtures(["nodes", "trees", "owners", "pets"]);

registerModel("Invoice", Invoice);
registerModel("LineItem", LineItem);
registerModel("Node", Node);
registerModel("Tree", Tree);
registerModel("Owner", Owner);
registerModel("Pet", Pet);
registerModel("Topic", Topic);

// Mirrors Ruby's `time.to_i` — whole epoch seconds, the granularity Rails'
// touch_later assertions compare at (DB datetime columns drop sub-second
// precision on round-trip).
function toI(value: unknown): number {
  return Math.floor((value as Temporal.Instant).epochMilliseconds / 1000);
}

// `Time.now.utc - 25.days`.
function twentyFiveDaysAgo(): Temporal.Instant {
  return Temporal.Now.instant().subtract({ hours: 24 * 25 });
}

describe("TouchLaterTest", () => {
  it("touch later raise if non persisted", async () => {
    const invoice = new Invoice();
    await Invoice.transaction(async () => {
      expect(invoice.isPersisted()).toBe(false);
      await expect(invoice.touchLater()).rejects.toThrow(
        "Cannot touch on a new or destroyed record",
      );
    });
  });

  it("touch later dont set dirty attributes", async () => {
    const invoice = await Invoice.create();
    await invoice.touchLater();
    expect(invoice.changed).toBe(false);
  });

  it("touch later respects no touching policy", async () => {
    const time = twentyFiveDaysAgo();
    const topic = await Topic.create({ updated_at: time, created_at: time });
    await Topic.noTouching(async () => {
      await topic.touchLater();
    });
    expect(toI(topic.updated_at)).toBe(toI(time));
  });

  it("touch later update the attributes", async () => {
    const time = twentyFiveDaysAgo();
    const topic = await Topic.create({ updated_at: time, created_at: time });
    expect(toI(topic.updated_at)).toBe(toI(time));
    expect(toI(topic.created_at)).toBe(toI(time));

    await Topic.transaction(async () => {
      await topic.touchLater("created_at");
      expect(toI(topic.updated_at)).not.toBe(toI(time));
      expect(toI(topic.created_at)).not.toBe(toI(time));

      expect(toI((await topic.reload()).updated_at)).toBe(toI(time));
      expect(toI((await topic.reload()).created_at)).toBe(toI(time));
    });
    expect(toI((await topic.reload()).updated_at)).not.toBe(toI(time));
    expect(toI((await topic.reload()).created_at)).not.toBe(toI(time));
  });

  it("touch touches immediately", async () => {
    const time = twentyFiveDaysAgo();
    const topic = await Topic.create({ updated_at: time, created_at: time });
    expect(toI(topic.updated_at)).toBe(toI(time));
    expect(toI(topic.created_at)).toBe(toI(time));

    await Topic.transaction(async () => {
      await topic.touchLater("created_at");
      await topic.touch();

      expect(toI((await topic.reload()).updated_at)).not.toBe(toI(time));
      expect(toI((await topic.reload()).created_at)).not.toBe(toI(time));
    });
  });

  it("touch later an association dont autosave parent", async () => {
    const time = twentyFiveDaysAgo();
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
    // Rails: `(Time.now.utc - 25.days).change(nsec: 0)` — whole seconds so the
    // exact-equality assertions survive the DB datetime round-trip.
    const time = Temporal.Instant.fromEpochMilliseconds(
      Math.floor(twentyFiveDaysAgo().epochMilliseconds / 1000) * 1000,
    );
    const topic = await Topic.create({ updated_at: time, created_at: time });
    expect(toI(topic.updated_at)).toBe(toI(time));
    expect(toI(topic.created_at)).toBe(toI(time));

    await Topic.transaction(async () => {
      await topic.touchLater("created_at");
      const customTime = Temporal.Now.instant().subtract({ hours: 24 * 2 });
      await topic.touch({ time: customTime });

      expect(toI((await topic.reload()).updated_at)).toBe(toI(customTime));
      expect(toI((await topic.reload()).created_at)).toBe(toI(customTime));
    });
  });

  it("touch later dont hit the db", async () => {
    const invoice = await Invoice.create();
    await assertNoQueries(false, async () => {
      await invoice.touchLater();
    });
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
      const time = twentyFiveDaysAgo();
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
      const time = twentyFiveDaysAgo();
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
    const inv = await Invoice.create();
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
    const inv = await Invoice.create();

    const fixedTime = new Date(2_000_000);
    (inv as any)._deferTouchAttrs = ["updated_at"];
    (inv as any)._touchTime = fixedTime;

    await touchDeferredAttributes.call(inv as any);

    expect((inv as any)._deferTouchAttrs).toBeNull();
    expect((inv as any)._touchTime).toBeNull();
  });
});
