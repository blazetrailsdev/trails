import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Hotel } from "../test-helpers/models/hotel.js";
import { Department } from "../test-helpers/models/department.js";
import { Chef } from "../test-helpers/models/chef.js";
import { CakeDesigner } from "../test-helpers/models/cake-designer.js";
import { DrinkDesigner } from "../test-helpers/models/drink-designer.js";

registerModel(Hotel);
registerModel(Department);
registerModel(Chef);
registerModel(CakeDesigner);
registerModel(DrinkDesigner);

describe("HABTM Slot E — polymorphic + STI through", () => {
  fixtures([]);

  async function seed() {
    const hotel = await Hotel.create({});
    const dept = await Department.create({ hotel_id: (hotel as any).id });
    const cake1 = await CakeDesigner.create({});
    const cake2 = await CakeDesigner.create({});
    const drink = await DrinkDesigner.create({});
    await Chef.create({
      department_id: (dept as any).id,
      employable_id: (cake1 as any).id,
      employable_type: "CakeDesigner",
    });
    await Chef.create({
      department_id: (dept as any).id,
      employable_id: (cake2 as any).id,
      employable_type: "CakeDesigner",
    });
    await Chef.create({
      department_id: (dept as any).id,
      employable_id: (drink as any).id,
      employable_type: "DrinkDesigner",
    });
    return { hotel, dept, cake1, cake2, drink };
  }

  it("polymorphic-through filters by source_type: only cakeDesigners, not drinkDesigners", async () => {
    const { hotel, cake1, cake2, drink } = await seed();
    const cakes = await (hotel as any).cakeDesigners.toArray();
    expect(cakes.map((d: any) => d.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [(cake1 as any).id, (cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
    expect(cakes.every((d: any) => d instanceof CakeDesigner)).toBe(true);
    expect(cakes.some((d: any) => d instanceof DrinkDesigner)).toBe(false);
  });

  it("includes() preloads polymorphic-through with source_type into the association target", async () => {
    const { hotel, cake1, cake2 } = await seed();
    const [h] = await Hotel.where({ id: (hotel as any).id }).includes(":cakeDesigners");
    const preloaded = (h.association("cakeDesigners").target ?? []) as any[];
    expect(preloaded.map((d: any) => d.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [(cake1 as any).id, (cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
    expect(preloaded.every((d: any) => d instanceof CakeDesigner)).toBe(true);
  });

  it("two source-typed associations on the same intermediate load disjoint sets (joined_different_table_twice)", async () => {
    const { hotel, cake1, cake2, drink } = await seed();
    const cakes = await (hotel as any).cakeDesigners.toArray();
    const drinks = await (hotel as any).drinkDesigners.toArray();
    expect(cakes.map((d: any) => d.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [(cake1 as any).id, (cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
    expect(drinks.map((d: any) => d.id)).toEqual([(drink as any).id]);
    expect(cakes.every((d: any) => d instanceof CakeDesigner)).toBe(true);
    expect(drinks.every((d: any) => d instanceof DrinkDesigner)).toBe(true);
  });

  it("includes() preloads disjoint source-typed associations from the same intermediate", async () => {
    const { hotel, cake1, cake2, drink } = await seed();
    const [h] = await Hotel.where({ id: (hotel as any).id })
      .includes(":cakeDesigners")
      .includes(":drinkDesigners");
    const cakes = (h.association("cakeDesigners").target ?? []) as any[];
    const drinks = (h.association("drinkDesigners").target ?? []) as any[];
    expect(cakes.map((d: any) => d.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [(cake1 as any).id, (cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
    expect(drinks.map((d: any) => d.id)).toEqual([(drink as any).id]);
    expect(cakes.every((d: any) => d instanceof CakeDesigner)).toBe(true);
    expect(drinks.every((d: any) => d instanceof DrinkDesigner)).toBe(true);
  });

  it.todo(
    "STI subclass at the polymorphic leaf materializes with the correct constructor under both load paths",
  );

  it("includes() + outer where preserves every preloaded polymorphic-through target", async () => {
    const { hotel, cake1, cake2 } = await seed();
    const [h] = await Hotel.where({ id: (hotel as any).id }).includes(":cakeDesigners");
    const preloaded = (h.association("cakeDesigners").target ?? []) as any[];
    expect(preloaded.map((d: any) => d.id).sort((a: any, b: any) => Number(a) - Number(b))).toEqual(
      [(cake1 as any).id, (cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("repeated preload of the polymorphic source resets the source reflection cleanly between calls", async () => {
    const { hotel: h1, cake1, cake2 } = await seed();
    const { hotel: h2, cake1: h2cake1, cake2: h2cake2 } = await seed();

    const [first] = await Hotel.where({ id: (h1 as any).id }).includes(":cakeDesigners");
    const firstIds = ((first.association("cakeDesigners").target ?? []) as any[])
      .map((d) => d.id)
      .sort((a: any, b: any) => Number(a) - Number(b));
    expect(firstIds).toEqual(
      [(cake1 as any).id, (cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );

    const [second] = await Hotel.where({ id: (h2 as any).id }).includes(":cakeDesigners");
    const secondIds = ((second.association("cakeDesigners").target ?? []) as any[])
      .map((d) => d.id)
      .sort((a: any, b: any) => Number(a) - Number(b));
    expect(secondIds).toEqual(
      [(h2cake1 as any).id, (h2cake2 as any).id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
    expect(secondIds.every((id) => !firstIds.includes(id))).toBe(true);
  });
});
