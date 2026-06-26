// Phase R.3: strict loading now catches sync singular-association
// reader access too. When `record._strictLoading` is enabled (via any
// of the Rails-style toggles), `record.developer` / `record.ship`
// throw `StrictLoadingViolationError` on an unloaded association
// instead of silently returning null.
//
// Preserves Rails default (off) — strict loading is opt-in.
// No Rails counterpart; rides canonical Developer/Ship tables.

import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, StrictLoadingViolationError } from "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Ship } from "./test-helpers/models/ship.js";
import { seedAssociationCache } from "./test-helpers/seed-association-cache.js";

describe("strict loading — sync singular reader (Phase R.3)", () => {
  const { developers, ships } = useHandlerFixtures(["developers", "ships"]);

  beforeAll(() => {
    registerModel(Developer);
    registerModel(Ship);
  });

  it("sync belongsTo access throws when strict loading is enabled and not loaded", async () => {
    // Ship.developer is a belongsTo; with developer_id set and strict loading
    // enabled, the sync getter must throw before attempting a DB load.
    const ship = await Ship.create({ name: "Strict Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    expect(() => (ship as any).developer).toThrow(StrictLoadingViolationError);
  });

  it("sync hasOne access throws when strict loading is enabled and not loaded", async () => {
    // Developer.ship is a hasOne; with strict loading enabled and no ship
    // preloaded, the sync getter must throw.
    const developer = await Developer.find(developers("jamis").id);
    developer.strictLoadingBang();
    expect(() => (developer as any).ship).toThrow(StrictLoadingViolationError);
  });

  it("sync access returns the record (no throw) once loaded", async () => {
    const ship = await Ship.create({ name: "Loaded Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    // Explicit async load populates the association cache.
    await ship.loadBelongsTo("developer");
    // Subsequent sync access should succeed.
    expect(() => (ship as any).developer).not.toThrow();
    const dev = (ship as any).developer as Developer;
    expect(dev.id).toBe(developers("david").id);
  });

  it("strict loading stays off by default (Rails parity)", () => {
    expect(Ship.strictLoadingByDefault).toBe(false);
    expect(Developer.strictLoadingByDefault).toBe(false);
    const ship = new Ship({ name: "default" });
    expect(ship.isStrictLoading()).toBe(false);
  });

  it("per-class toggle: strictLoadingByDefault = true makes all instances strict", async () => {
    Ship.strictLoadingByDefault = true;
    try {
      const ship = await Ship.create({
        name: "Strict Default Ship",
        developer_id: developers("david").id,
      });
      const fetched = await Ship.find(ship.id);
      expect(fetched.isStrictLoading()).toBe(true);
      expect(() => (fetched as any).developer).toThrow(StrictLoadingViolationError);
    } finally {
      Ship.strictLoadingByDefault = false;
    }
  });

  it("per-instance opt-out: strictLoadingBang(false) suppresses the throw", async () => {
    const ship = await Ship.create({ name: "Opt-out Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    ship.strictLoadingBang(false);
    expect(ship.isStrictLoading()).toBe(false);
    expect(() => (ship as any).developer).not.toThrow();
  });

  it("belongsTo with null FK returns null without throwing under strict loading", async () => {
    // No FK set → findTargetNeeded() is false → sync access returns null, no raise.
    const ship = await Ship.create({ name: "Orphan Ship" });
    ship.strictLoadingBang();
    expect(() => (ship as any).developer).not.toThrow();
    expect((ship as any).developer).toBeNull();
  });

  it("preloaded singular mapped to null does not throw (eagerly-loaded nil)", async () => {
    const ship = await Ship.create({ name: "No-dev Ship" });
    ship.strictLoadingBang();
    // Simulate an eager load that resolved to null.
    const holder = (ship as any).association("developer");
    holder.setTarget(null);
    holder._loadedFromPreload = true;
    expect(() => (ship as any).developer).not.toThrow();
    expect((ship as any).developer).toBeNull();
  });

  it("cached association via inverse_of does not throw under strict loading", async () => {
    const ship = await Ship.create({ name: "Cached Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    const developer = new Developer({ id: developers("david").id });
    // Cache the singular target on the holder (as _cacheSingularTarget does).
    seedAssociationCache(ship as any, "developer", developer);
    expect(() => (ship as any).developer).not.toThrow();
    expect(((ship as any).developer as Developer).id).toBe(developers("david").id);
  });

  it("hasOne on a new (unsaved) owner returns null without throwing", async () => {
    // New records with no primary key → findTargetNeeded() is false
    // (no ID to query by), so strict loading does not fire.
    const developer = new Developer({ name: "new" });
    developer.strictLoadingBang();
    expect(() => (developer as any).ship).not.toThrow();
    expect((developer as any).ship).toBeNull();
  });

  it("in-memory `target` set directly (e.g. Preloader path) returns without throwing", async () => {
    const ship = await Ship.create({
      name: "Preloader Ship",
      developer_id: developers("david").id,
    });
    ship.strictLoadingBang();
    const developer = new Developer({ id: developers("david").id });
    const assoc = ship.association("developer") as any;
    assoc.target = developer;
    // loaded is still false; reader should short-circuit on the non-null target.
    expect(assoc.loaded).toBe(false);
    expect(() => (ship as any).developer).not.toThrow();
    expect(((ship as any).developer as Developer).id).toBe(developers("david").id);
    // Reader should have marked it loaded as a side effect.
    expect(assoc.loaded).toBe(true);
  });

  it("ships fixture is linked to developer in the ships fixture", () => {
    // Sanity check: the ships fixture (black_pearl) has a pirate_id, not developer_id.
    // The interceptor has no developer_id. This confirms sync-reader tests
    // that use developer_id must create their own ships.
    expect(ships("interceptor").developer_id).toBeFalsy();
  });
});
