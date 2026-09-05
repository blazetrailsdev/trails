import { describe, it, expect } from "vitest";
import { assertNotPredicate } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { travel, travelBack } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { ActiveRecord } from "./ar-config.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { Invoice } from "./test-helpers/models/invoice.js";
import { LineItem } from "./test-helpers/models/line-item.js";
import { Node } from "./test-helpers/models/node.js";
import { Topic } from "./test-helpers/models/topic.js";

const { nodes, trees, owners, pets } = fixtures(["nodes", "trees", "owners", "pets"]);

function toI(value: unknown): number {
  return (value as RubyTime).toI();
}

function twentyFiveDaysAgo(): RubyTime {
  return RubyTime.now().minus(24 * 25 * 3600) as RubyTime;
}

describe("TouchLaterTest", () => {
  it("touch later raise if non persisted", async () => {
    const invoice = new Invoice();
    await Invoice.transaction(async () => {
      assertNotPredicate(invoice, (i) => i.isPersisted());
      await expect(invoice.touchLater()).rejects.toThrow(
        "Cannot touch on a new or destroyed record",
      );
    });
  });

  it("touch later dont set dirty attributes", async () => {
    const invoice = await Invoice.create();
    await invoice.touchLater();
    assertNotPredicate(invoice, (i) => i.isChanged);
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
      expect(toI(reloaded.updated_at)).toBe(toI(time));
    });

    expect(toI(invoice.updated_at)).not.toBe(toI(time));
  });

  it("touch touches immediately with a custom time", async () => {
    const time = RubyTime.at(twentyFiveDaysAgo().toI());
    const topic = await Topic.create({ updated_at: time, created_at: time });
    expect(toI(topic.updated_at)).toBe(toI(time));
    expect(toI(topic.created_at)).toBe(toI(time));

    await Topic.transaction(async () => {
      await topic.touchLater("created_at");
      const customTime = RubyTime.now().minus(24 * 2 * 3600) as RubyTime;
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
    ActiveRecord.beforeCommittedOnAllRecords = false;
    try {
      const time = twentyFiveDaysAgo();
      const owner = owners("blackbeard") as any;
      const petId = (pets("parrot") as any).readAttribute("pet_id");

      await owner.touch({ time });
      expect(toI((await owner.reload()).updated_at)).toBe(toI(time));

      await owner.update({ petsAttributes: { "0": { id: String(petId), name: "Alfred" } } });

      expect(toI((await owner.reload()).updated_at)).toBe(toI(time));
    } finally {
      ActiveRecord.beforeCommittedOnAllRecords = false;
    }
  });

  it("touching through nested attributes with before committed on all records", async () => {
    ActiveRecord.beforeCommittedOnAllRecords = true;
    try {
      const time = twentyFiveDaysAgo();
      const owner = owners("blackbeard") as any;
      const petId = (pets("parrot") as any).readAttribute("pet_id");

      await owner.touch({ time });
      expect(toI((await owner.reload()).updated_at)).toBe(toI(time));

      await owner.update({ petsAttributes: { "0": { id: String(petId), name: "Alfred" } } });

      expect(toI((await owner.reload()).updated_at)).not.toBe(toI(time));
    } finally {
      ActiveRecord.beforeCommittedOnAllRecords = false;
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

    expect(written).toEqual([["updated_at", touchTime]]);
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
