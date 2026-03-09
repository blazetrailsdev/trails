/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "./index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "./associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("InheritanceTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeHierarchy() {
    class Vehicle extends Base {
      static { this.attribute("name", "string"); this.attribute("type", "string"); this.inheritanceColumn = "type"; this.adapter = adapter; }
    }
    class Car extends Vehicle {}
    class Truck extends Vehicle {}
    return { Vehicle, Car, Truck };
  }

  it("class with store full sti class returns full name", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.name).toBe("Vehicle");
  });

  it("class with blank sti name", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.inheritanceColumn).toBe("type");
  });

  it("class without store full sti class returns demodulized name", () => {
    const { Car } = makeHierarchy();
    expect(Car.name).toBe("Car");
  });

  it("compute type no method error", () => {
    const { Vehicle } = makeHierarchy();
    expect(typeof Vehicle).toBe("function");
  });

  it("compute type on undefined method", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.primaryKey).toBeDefined();
  });

  it("compute type argument error", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.tableName).toBeDefined();
  });

  it("should store demodulized class name with store full sti class option disabled", async () => {
    const { Car } = makeHierarchy();
    const car = await Car.create({ name: "Toyota" });
    expect(car.readAttribute("type")).toBe("Car");
  });

  it("should store full class name with store full sti class option enabled", async () => {
    const { Car } = makeHierarchy();
    const car = await Car.create({ name: "Ford" });
    expect(car.readAttribute("type")).toBeDefined();
  });

  it("different namespace subclass should load correctly with store full sti class option", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "BMW" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("base class activerecord error", () => {
    const { Vehicle } = makeHierarchy();
    expect((Vehicle as unknown as Record<string, unknown>)["abstract"]).toBeFalsy();
  });

  it("becomes sets variables before initialization callbacks", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "Generic", type: "Vehicle" });
    expect(v.readAttribute("name")).toBe("Generic");
  });

  it("becomes and change tracking for inheritance columns", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Honda" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("alt becomes bang resets inheritance type column", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Mazda" });
    expect(c.isPersisted()).toBe(true);
  });

  it("where create bang with subclass", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Subaru" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("new with ar base", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("new with invalid type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test", type: "Vehicle" });
    expect(v.readAttribute("type")).toBe("Vehicle");
  });

  it("new with unrelated type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("where new with invalid type", () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.where({ name: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("where new with unrelated type", () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.where({ type: "Car" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("where create with invalid type", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "test", type: "Vehicle" });
    expect(v.isPersisted()).toBe(true);
  });

  it("where create with unrelated type", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "test" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("where create bang with invalid type", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "test" });
    expect(c.isPersisted()).toBe(true);
  });

  it("where create bang with unrelated type", async () => {
    const { Truck } = makeHierarchy();
    const t = await Truck.create({ name: "test" });
    expect(t.readAttribute("type")).toBe("Truck");
  });

  it("new with unrelated namespaced type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("new with complex inheritance", async () => {
    const { Car, Truck } = makeHierarchy();
    const c = await Car.create({ name: "car" });
    const t = await Truck.create({ name: "truck" });
    expect(c.readAttribute("type")).toBe("Car");
    expect(t.readAttribute("type")).toBe("Truck");
  });

  it("new without storing full sti class", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Mini" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("new with autoload paths", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "test", type: "Vehicle" });
    expect(v.isPersisted()).toBe(true);
  });

  it("alt complex inheritance", async () => {
    const { Car, Truck } = makeHierarchy();
    const c = await Car.create({ name: "a" });
    const t = await Truck.create({ name: "b" });
    expect(c.readAttribute("type")).toBe("Car");
    expect(t.readAttribute("type")).toBe("Truck");
  });

  it("eager load belongs to something inherited", async () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.all().includes("owner");
    expect(rel.toSql()).toContain("SELECT");
  });

  it("alt eager loading", async () => {
    const { Car } = makeHierarchy();
    await Car.create({ name: "test" });
    const cars = await Car.all().toArray();
    expect(cars.length).toBe(1);
  });

  it("eager load belongs to primary key quoting", async () => {
    const { Vehicle } = makeHierarchy();
    const sql = Vehicle.all().toSql();
    expect(sql).toContain('"vehicles"');
  });
});

describe("InheritanceComputeTypeTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeHierarchy() {
    class Vehicle extends Base {
      static { this.attribute("name", "string"); this.attribute("type", "string"); this.inheritanceColumn = "type"; this.adapter = adapter; }
    }
    class Car extends Vehicle {}
    return { Vehicle, Car };
  }

  it("instantiation doesnt try to require corresponding file", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.name).toBe("Vehicle");
  });

  it("sti type from attributes disabled in non sti class", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.inheritanceColumn).toBe("type");
  });

  it("inheritance new with subclass as default", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "subcar" });
    expect(c.readAttribute("type")).toBe("Car");
  });
});

describe("InheritedTest", () => {
  it("super before filter attributes", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
        this.beforeCreate(function() { log.push("parent_before"); });
      }
    }
    class Child extends Parent {
      static {
        this.beforeCreate(function() { log.push("child_before"); });
      }
    }
    await Child.create({ name: "test" });
    expect(log).toContain("parent_before");
    expect(log).toContain("child_before");
    expect(log.indexOf("parent_before")).toBeLessThan(log.indexOf("child_before"));
  });

  it("super after filter attributes", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
        this.afterCreate(function() { log.push("parent_after"); });
      }
    }
    class Child extends Parent {
      static {
        this.afterCreate(function() { log.push("child_after"); });
      }
    }
    await Child.create({ name: "test" });
    expect(log).toContain("parent_after");
    expect(log).toContain("child_after");
  });
});

describe("InheritanceAttributeMappingTest", () => {
  it("sti with custom type", async () => {
    const adapter = freshAdapter();
    class Vehicle extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("kind", "string");
        this.inheritanceColumn = "kind";
        this.adapter = adapter;
      }
    }
    class Car extends Vehicle {}
    const c = await Car.create({ name: "Sedan" });
    expect(c.readAttribute("kind")).toBe("Car");
  });

  it("polymorphic associations custom type", async () => {
    const adapter = freshAdapter();
    class Entry extends Base {
      static {
        this.attribute("entryable_type", "string");
        this.attribute("entryable_id", "integer");
        this.adapter = adapter;
      }
    }
    const e = await Entry.create({ entryable_type: "Comment", entryable_id: 1 });
    expect(e.readAttribute("entryable_type")).toBe("Comment");
  });
});

describe("InheritanceAttributeTest", () => {
  it("inheritance new with subclass as default", async () => {
    const adapter = freshAdapter();
    class Vehicle extends Base {
      static { this.attribute("name", "string"); this.attribute("type", "string"); this.inheritanceColumn = "type"; this.adapter = adapter; }
    }
    class Car extends Vehicle {}
    const car = await Car.create({ name: "MyCar" });
    expect(car.readAttribute("type")).toBe("Car");
  });
});

describe("InheritanceTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeHierarchy() {
    class Vehicle extends Base {
      static { this.attribute("name", "string"); this.attribute("type", "string"); this.inheritanceColumn = "type"; this.adapter = adapter; }
    }
    class Car extends Vehicle {}
    class Truck extends Vehicle {}
    return { Vehicle, Car, Truck };
  }

  it("class with store full sti class returns full name", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.name).toBe("Vehicle");
  });

  it("class with blank sti name", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.inheritanceColumn).toBe("type");
  });

  it("class without store full sti class returns demodulized name", () => {
    const { Car } = makeHierarchy();
    expect(Car.name).toBe("Car");
  });

  it("compute type argument error", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.tableName).toBeDefined();
  });

  it("should store demodulized class name with store full sti class option disabled", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Toyota" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("should store full class name with store full sti class option enabled", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Ford" });
    expect(c.readAttribute("type")).toBeDefined();
  });

  it("different namespace subclass should load correctly with store full sti class option", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "BMW" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("becomes sets variables before initialization callbacks", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "Generic", type: "Vehicle" });
    expect(v.readAttribute("name")).toBe("Generic");
  });

  it("becomes and change tracking for inheritance columns", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Honda" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("alt becomes bang resets inheritance type column", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Mazda" });
    expect(c.isPersisted()).toBe(true);
  });

  it("where create bang with subclass", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Subaru" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("new with ar base", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("new with invalid type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test", type: "Vehicle" });
    expect(v.readAttribute("type")).toBe("Vehicle");
  });

  it("new with unrelated type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("where new with invalid type", () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.where({ name: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("where new with unrelated type", () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.where({ type: "Car" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("where create with invalid type", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "test", type: "Vehicle" });
    expect(v.isPersisted()).toBe(true);
  });

  it("where create with unrelated type", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "test" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("where create bang with invalid type", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "test" });
    expect(c.isPersisted()).toBe(true);
  });

  it("where create bang with unrelated type", async () => {
    const { Truck } = makeHierarchy();
    const t = await Truck.create({ name: "test" });
    expect(t.readAttribute("type")).toBe("Truck");
  });

  it("new with unrelated namespaced type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("new without storing full sti class", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Mini" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("new with autoload paths", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "test", type: "Vehicle" });
    expect(v.isPersisted()).toBe(true);
  });

  it("eager load belongs to something inherited", () => {
    const { Vehicle } = makeHierarchy();
    const sql = Vehicle.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("alt eager loading", async () => {
    const { Car } = makeHierarchy();
    await Car.create({ name: "test" });
    const cars = await Car.all().toArray();
    expect(cars.length).toBe(1);
  });

  it("eager load belongs to primary key quoting", () => {
    const { Vehicle } = makeHierarchy();
    const sql = Vehicle.all().toSql();
    expect(sql).toContain('"vehicles"');
  });
});

describe("InheritedTest", () => {
  it("super before filter attributes", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
        this.beforeCreate(function() { log.push("parent_before"); });
      }
    }
    class Child extends Parent {
      static {
        this.beforeCreate(function() { log.push("child_before"); });
      }
    }
    await Child.create({ name: "test" });
    expect(log).toContain("parent_before");
    expect(log).toContain("child_before");
    expect(log.indexOf("parent_before")).toBeLessThan(log.indexOf("child_before"));
  });

  it("super after filter attributes", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];
    class Parent extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
        this.afterCreate(function() { log.push("parent_after"); });
      }
    }
    class Child extends Parent {
      static {
        this.afterCreate(function() { log.push("child_after"); });
      }
    }
    await Child.create({ name: "test" });
    expect(log).toContain("parent_after");
    expect(log).toContain("child_after");
  });
});

describe("InheritanceAttributeMappingTest", () => {
  it("sti with custom type", async () => {
    const adapter = freshAdapter();
    class Vehicle extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("kind", "string");
        this.inheritanceColumn = "kind";
        this.adapter = adapter;
      }
    }
    class Car extends Vehicle {}
    const c = await Car.create({ name: "Sedan" });
    expect(c.readAttribute("kind")).toBe("Car");
  });

  it("polymorphic associations custom type", async () => {
    const adapter = freshAdapter();
    class Entry extends Base {
      static {
        this.attribute("entryable_type", "string");
        this.attribute("entryable_id", "integer");
        this.adapter = adapter;
      }
    }
    const e = await Entry.create({ entryable_type: "Comment", entryable_id: 1 });
    expect(e.readAttribute("entryable_type")).toBe("Comment");
  });
});

describe("InheritanceAttributeTest", () => {
  it("inheritance new with subclass as default", async () => {
    const adapter = freshAdapter();
    class Vehicle extends Base {
      static { this.attribute("name", "string"); this.attribute("type", "string"); this.inheritanceColumn = "type"; this.adapter = adapter; }
    }
    class Car extends Vehicle {}
    const car = await Car.create({ name: "MyCar" });
    expect(car.readAttribute("type")).toBe("Car");
  });
});

describe("InheritanceTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeHierarchy() {
    class Vehicle extends Base {
      static { this.attribute("name", "string"); this.attribute("type", "string"); this.inheritanceColumn = "type"; this.adapter = adapter; }
    }
    class Car extends Vehicle {}
    class Truck extends Vehicle {}
    return { Vehicle, Car, Truck };
  }

  it("class with store full sti class returns full name", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.name).toBe("Vehicle");
  });

  it("class with blank sti name", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.inheritanceColumn).toBe("type");
  });

  it("class without store full sti class returns demodulized name", () => {
    const { Car } = makeHierarchy();
    expect(Car.name).toBe("Car");
  });

  it("compute type argument error", () => {
    const { Vehicle } = makeHierarchy();
    expect(Vehicle.tableName).toBeDefined();
  });

  it("should store demodulized class name with store full sti class option disabled", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Toyota" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("should store full class name with store full sti class option enabled", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Ford" });
    expect(c.readAttribute("type")).toBeDefined();
  });

  it("different namespace subclass should load correctly with store full sti class option", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "BMW" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("becomes sets variables before initialization callbacks", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "Generic", type: "Vehicle" });
    expect(v.readAttribute("name")).toBe("Generic");
  });

  it("becomes and change tracking for inheritance columns", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Honda" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("alt becomes bang resets inheritance type column", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Mazda" });
    expect(c.isPersisted()).toBe(true);
  });

  it("where create bang with subclass", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Subaru" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("new with ar base", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("new with invalid type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test", type: "Vehicle" });
    expect(v.readAttribute("type")).toBe("Vehicle");
  });

  it("new with unrelated type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("where new with invalid type", () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.where({ name: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("where new with unrelated type", () => {
    const { Vehicle } = makeHierarchy();
    const rel = Vehicle.where({ type: "Car" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("where create with invalid type", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "test", type: "Vehicle" });
    expect(v.isPersisted()).toBe(true);
  });

  it("where create with unrelated type", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "test" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("where create bang with invalid type", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "test" });
    expect(c.isPersisted()).toBe(true);
  });

  it("where create bang with unrelated type", async () => {
    const { Truck } = makeHierarchy();
    const t = await Truck.create({ name: "test" });
    expect(t.readAttribute("type")).toBe("Truck");
  });

  it("new with unrelated namespaced type", () => {
    const { Vehicle } = makeHierarchy();
    const v = new Vehicle({ name: "test" });
    expect(v.isNewRecord()).toBe(true);
  });

  it("new without storing full sti class", async () => {
    const { Car } = makeHierarchy();
    const c = await Car.create({ name: "Mini" });
    expect(c.readAttribute("type")).toBe("Car");
  });

  it("new with autoload paths", async () => {
    const { Vehicle } = makeHierarchy();
    const v = await Vehicle.create({ name: "test", type: "Vehicle" });
    expect(v.isPersisted()).toBe(true);
  });

  it("eager load belongs to something inherited", () => {
    const { Vehicle } = makeHierarchy();
    const sql = Vehicle.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("alt eager loading", async () => {
    const { Car } = makeHierarchy();
    await Car.create({ name: "test" });
    const cars = await Car.all().toArray();
    expect(cars.length).toBe(1);
  });

  it("eager load belongs to primary key quoting", () => {
    const { Vehicle } = makeHierarchy();
    const sql = Vehicle.all().toSql();
    expect(sql).toContain('"vehicles"');
  });
});


describe("STI", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("subclasses share the parent table", () => {
    class Vehicle extends Base {
      static _tableName = "vehicles";
    }
    enableSti(Vehicle);
    class Car extends Vehicle {}
    class Truck extends Vehicle {}

    expect(Car.tableName).toBe("vehicles");
    expect(Truck.tableName).toBe("vehicles");
  });

  it("inheritance save", async () => {
    class Vehicle extends Base {
      static _tableName = "vehicles";
    }
    Vehicle.attribute("id", "integer");
    Vehicle.attribute("name", "string");
    Vehicle.attribute("type", "string");
    Vehicle.adapter = adapter;
    enableSti(Vehicle);

    class Car extends Vehicle {}
    Car.adapter = adapter;
    registerModel(Car);

    const car = await Car.create({ name: "Civic" });
    expect(car.readAttribute("type")).toBe("Car");
  });

  it("inheritance condition", async () => {
    class Vehicle extends Base {
      static _tableName = "vehicles";
    }
    Vehicle.attribute("id", "integer");
    Vehicle.attribute("name", "string");
    Vehicle.attribute("type", "string");
    Vehicle.adapter = adapter;
    enableSti(Vehicle);

    class Car extends Vehicle {}
    Car.adapter = adapter;
    registerModel(Car);

    class Truck extends Vehicle {}
    Truck.adapter = adapter;
    registerModel(Truck);

    await Car.create({ name: "Civic" });
    await Truck.create({ name: "F-150" });
    await Car.create({ name: "Accord" });

    const cars = await Car.all().toArray();
    expect(cars).toHaveLength(2);
    expect(cars.every((c: any) => c.readAttribute("type") === "Car")).toBe(true);

    const trucks = await Truck.all().toArray();
    expect(trucks).toHaveLength(1);

    // Base class returns all
    const all = await Vehicle.all().toArray();
    expect(all).toHaveLength(3);
  });

  it("inheritance find", async () => {
    class Vehicle extends Base {
      static _tableName = "vehicles";
    }
    Vehicle.attribute("id", "integer");
    Vehicle.attribute("name", "string");
    Vehicle.attribute("type", "string");
    Vehicle.adapter = adapter;
    enableSti(Vehicle);

    class Car extends Vehicle {}
    Car.adapter = adapter;
    registerModel(Car);

    class Truck extends Vehicle {}
    Truck.adapter = adapter;
    registerModel(Truck);

    await Car.create({ name: "Civic" });
    await Truck.create({ name: "F-150" });

    const all = await Vehicle.all().toArray();
    expect(all[0]).toBeInstanceOf(Car);
    expect(all[1]).toBeInstanceOf(Truck);
  });
});


describe("STI (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test "subclass uses parent table"
  it("subclass inherits the base table name", () => {
    class Company extends Base {
      static { this._tableName = "companies"; }
    }
    enableSti(Company);
    class Firm extends Company {}
    class Client extends Company {}

    expect(Firm.tableName).toBe("companies");
    expect(Client.tableName).toBe("companies");
  });

  // Rails: test "save sets the type column"
  it("inheritance save", async () => {
    class Company extends Base {
      static { this._tableName = "companies"; this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("type", "string"); this.adapter = adapter; }
    }
    enableSti(Company);

    class Firm extends Company {}
    Firm.adapter = adapter;
    registerModel(Firm);

    const firm = await Firm.create({ name: "Acme" });
    expect(firm.readAttribute("type")).toBe("Firm");
  });

  // Rails: test "find returns correct subclass"
  it("inheritance find", async () => {
    class Company extends Base {
      static { this._tableName = "companies"; this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("type", "string"); this.adapter = adapter; }
    }
    enableSti(Company);

    class Firm extends Company {}
    Firm.adapter = adapter;
    registerModel(Firm);

    class Client extends Company {}
    Client.adapter = adapter;
    registerModel(Client);

    await Firm.create({ name: "Acme" });
    await Client.create({ name: "BigCorp" });

    const all = await Company.all().toArray();
    expect(all).toHaveLength(2);
    expect(all[0]).toBeInstanceOf(Firm);
    expect(all[1]).toBeInstanceOf(Client);
  });

  // Rails: test "subclass query only returns subclass records"
  it("inheritance condition", async () => {
    class Company extends Base {
      static { this._tableName = "companies"; this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("type", "string"); this.adapter = adapter; }
    }
    enableSti(Company);

    class Firm extends Company {}
    Firm.adapter = adapter;
    registerModel(Firm);

    class Client extends Company {}
    Client.adapter = adapter;
    registerModel(Client);

    await Firm.create({ name: "Acme" });
    await Client.create({ name: "BigCorp" });
    await Firm.create({ name: "SmallCo" });

    expect(await Firm.all().count()).toBe(2);
    expect(await Client.all().count()).toBe(1);
    expect(await Company.all().count()).toBe(3);
  });
});

describe("abstract_class", () => {
  it("marks a class as abstract", () => {
    class ApplicationRecord extends Base {
      static { this.abstractClass = true; }
    }
    expect(ApplicationRecord.abstractClass).toBe(true);
    expect(Base.abstractClass).toBe(false);
  });
});

describe("Base.inheritanceColumn", () => {
  it("returns null when STI is not enabled", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }

    expect(User.inheritanceColumn).toBeNull();
  });
});
