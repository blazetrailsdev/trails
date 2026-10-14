import { describe, expect, it } from "vitest";
import { Marshal, rbModName } from "@blazetrails/ruby-compat";
import type { CollectionProxy } from "../associations/collection-proxy.js";
import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Reply } from "../test-helpers/models/reply.js";
import { Topic } from "../test-helpers/models/topic.js";

describe("Relation round-trips Marshal", () => {
  fixtures(["topics"]);

  async function ids(relation: { toArray(): Promise<Base[]> }): Promise<unknown[]> {
    return (await relation.toArray()).map((record) => record.id);
  }

  function roundTrip<T>(value: T): T {
    return Marshal.load(Marshal.dump(value)) as T;
  }

  it("loads the same records from a model's relation", async () => {
    const relation = Topic.where({ approved: true }).order("id");
    const loaded = roundTrip(relation);

    expect(loaded).toBeInstanceOf(relation.constructor);
    expect(await ids(loaded)).toEqual(await ids(relation));
    expect((await ids(loaded)).length).toBeGreaterThan(0);
    expect(await ids(roundTrip(Topic.all()))).toEqual(await ids(Topic.all()));
  });

  it("loads the same records from an association scope and from a CollectionProxy", async () => {
    const topic = await Topic.find(1);
    const scope = topic.association("replies").scope() as Relation<Base>;
    const proxy = topic.replies as unknown as CollectionProxy<Base>;
    const expected = await ids(scope);

    expect(expected.length).toBeGreaterThan(0);
    expect(await ids(roundTrip(scope))).toEqual(expected);
    expect(await ids(roundTrip(proxy))).toEqual(expected);
  });

  it("seats a delegate class under its model, and inspect still names its superclass", async () => {
    const relation = Reply.where({ id: 0 });

    expect(rbModName(relation.constructor)).toBe("Reply::ActiveRecord_Relation");
    expect(await relation.inspect()).toBe("#<ActiveRecord::Relation []>");
  });
});
