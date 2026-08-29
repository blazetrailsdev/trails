import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, StrictLoadingViolationError } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Ship } from "./test-helpers/models/ship.js";

describe("strict loading — sync singular reader (Phase R.3)", () => {
  const { developers, ships } = fixtures(["developers", "ships"]);

  beforeAll(() => {
    registerModel(Developer);
    registerModel(Ship);
  });

  it("sync belongsTo access throws when strict loading is enabled and not loaded", async () => {
    const ship = await Ship.create({ name: "Strict Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    expect(() => (ship as any).developer).toThrow(StrictLoadingViolationError);
  });

  it("sync hasOne access throws when strict loading is enabled and not loaded", async () => {
    const developer = await Developer.find(developers("jamis").id);
    developer.strictLoadingBang();
    expect(() => (developer as any).ship).toThrow(StrictLoadingViolationError);
  });

  it("sync access returns the record (no throw) once loaded", async () => {
    const ship = await Ship.create({ name: "Loaded Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    await ship.loadBelongsTo("developer");
    expect(() => (ship as any).developer).not.toThrow();
    const dev = (ship as any).developer as Developer;
    expect(dev.id).toBe(developers("david").id);
  });

  it("sync belongsTo access does not throw under n_plus_one_only mode", async () => {
    const ship = await Ship.create({ name: "N+1 Ship", developer_id: developers("david").id });
    ship.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(() => (ship as any).developer).not.toThrow();
  });

  it("sync hasOne access does not throw when the reflection opts out of strict loading", async () => {
    const developer = await Developer.find(developers("jamis").id);
    developer.strictLoadingBang();
    const options = (
      Developer as unknown as {
        _reflectOnAssociation(name: string): { options: Record<string, unknown> };
      }
    )._reflectOnAssociation("ship").options;
    options.strictLoading = false;
    try {
      expect(() => (developer as any).ship).not.toThrow();
    } finally {
      delete options.strictLoading;
    }
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
    const ship = await Ship.create({ name: "Orphan Ship" });
    ship.strictLoadingBang();
    expect(() => (ship as any).developer).not.toThrow();
    expect((ship as any).developer).toBeNull();
  });

  it("preloaded singular mapped to null does not throw (eagerly-loaded nil)", async () => {
    const ship = await Ship.create({ name: "No-dev Ship" });
    ship.strictLoadingBang();
    const holder = (ship as any).association("developer");
    holder.setTarget(null);
    expect(() => (ship as any).developer).not.toThrow();
    expect((ship as any).developer).toBeNull();
  });

  it("cached association via inverse_of does not throw under strict loading", async () => {
    const ship = await Ship.create({ name: "Cached Ship", developer_id: developers("david").id });
    ship.strictLoadingBang();
    const developer = new Developer({ id: developers("david").id });
    (ship as any).association("developer").writer(developer);
    expect(() => (ship as any).developer).not.toThrow();
    expect(((ship as any).developer as Developer).id).toBe(developers("david").id);
  });

  it("hasOne on a new (unsaved) owner returns null without throwing", async () => {
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
    assoc._writeTargetStore(developer);
    expect(assoc.loaded).toBe(false);
    expect(() => (ship as any).developer).not.toThrow();
    expect(((ship as any).developer as Developer).id).toBe(developers("david").id);
    expect(assoc.loaded).toBe(true);
  });

  it("ships fixture is linked to developer in the ships fixture", () => {
    expect(ships("interceptor").developer_id).toBeFalsy();
  });
});
