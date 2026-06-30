// AssociationRelation — writes on a relation produced by a collection
// association should route through the owner so the foreign key, inverse,
// and loaded target stay wired up. Mirrors Rails'
// ActiveRecord::AssociationRelation behavior.
//
// No 1:1 Rails counterpart; AssociationRelation behaviour lives across
// relations_test.rb / has_many_associations_test.rb. Rides the canonical
// schema (`Ship has_many :parts`, `ShipPart belongs_to :ship` + validates
// name) + fixtures, no inline tables and no defineSchema.

import { describe, it, expect } from "vitest";
import { association, registerModel, AssociationRelation } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Ship } from "../test-helpers/models/ship.js";
import { ShipPart } from "../test-helpers/models/ship-part.js";

registerModel(Ship);
registerModel(ShipPart);

describe("AssociationRelation", () => {
  fixtures(["ships"]);

  async function freshShip(): Promise<Ship> {
    const ship = new Ship({ name: "Dev" });
    await ship.save();
    return ship;
  }

  it("returns an AssociationRelation from the collection proxy", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const scope = proxy.where({ name: "Mast" });
    expect(scope).toBeInstanceOf(AssociationRelation);
  });

  it("preserves AssociationRelation through chained query methods", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const chained = proxy.where({ name: "Mast" }).order("name").limit(5);
    expect(chained).toBeInstanceOf(AssociationRelation);
  });

  it("create on an association relation sets the owner's foreign key", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const part = await proxy.where({ name: "Mast" }).create({});
    expect(Number(part.ship_id)).toBe(Number(ship.id));
    expect(part.name).toBe("Mast");
    expect(part.isPersisted()).toBe(true);
  });

  it("build on an association relation sets the FK without saving", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const part = proxy.where({ name: "Draft" }).build({});
    expect(Number(part.ship_id)).toBe(Number(ship.id));
    expect(part.name).toBe("Draft");
    expect(part.isNewRecord()).toBe(true);
  });

  it("pushes built records onto the loaded target", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    proxy.where({ name: "x" }).build({});
    expect(proxy.target.length).toBe(1);
    expect(proxy.target[0].name).toBe("x");
  });

  it("propagates the association reference through long chains", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const deep = proxy.where({ name: "Chained" }).order("name").limit(10).offset(0);
    const part = await deep.create({});
    expect(Number(part.ship_id)).toBe(Number(ship.id));
    expect(part.name).toBe("Chained");
  });

  it("exposes the owner and reflection via proxyAssociation", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const scope = proxy.where({ name: "Mast" }) as unknown as AssociationRelation<ShipPart>;
    expect(scope.proxyAssociation.owner).toBe(ship);
    expect(scope.proxyAssociation.reflection.name).toBe("parts");
    expect(scope.proxyAssociation.reflection.type).toBe("hasMany");
  });

  it("equals compares against a loaded array of records", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    await proxy.create({ name: "A" });
    await proxy.create({ name: "A" });
    await proxy.create({ name: "B" });

    const scope = proxy
      .where({ name: "A" })
      .order("id") as unknown as AssociationRelation<ShipPart>;
    const records = await scope.toArray();
    expect(records.length).toBe(2);
    expect(await scope.equals(records)).toBe(true);
    expect(await scope.equals([])).toBe(false);
  });

  it("createBang throws RecordInvalid via the association on validation failure", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    const scope = proxy.where({}) as unknown as AssociationRelation<ShipPart>;
    await expect(scope.createBang({ name: "" })).rejects.toThrow(/name/i);
  });

  it("sets inverse_of on records loaded through the relation", async () => {
    const ship = await freshShip();
    const proxy = association<ShipPart>(ship, "parts");
    await proxy.create({ name: "P1" });

    const scope = proxy.where({}) as unknown as AssociationRelation<ShipPart>;
    const [part] = await scope.toArray();
    expect((part as any)._associationCache("ship")?.target).toBe(ship);
  });
});
