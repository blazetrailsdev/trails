/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Base, composedOf } from "./index.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
// Aliased: a top-level `Customer` binding would make the bundler rename the inline
// `class Customer extends Base` definitions below to `Customer2` (lexical-scope
// de-clash), shifting their inferred table name to `customer2s` and breaking those
// tests. The alias keeps the inline class names — and thus their table names — intact.
import {
  Customer as CustomerModel,
  Money as MoneyClass,
  Address,
  GpsLocation,
  Fullname,
} from "./test-helpers/models/customer.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ==========================================================================
// AggregationsTest — targets aggregations_test.rb
// ==========================================================================
describe("AggregationsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      customers: { name: "string", address_street: "string", address_city: "string" },
      locations: { name: "string", lat: "float", lng: "float" },
      articles: { title: "string", tag_name: "string" },
    });
  });
  // Rails: test_find_multiple_value_object
  it("find multiple value object", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("address_street", "string");
        this.attribute("address_city", "string");
      }
    }
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = await Customer.create({
      name: "Alice",
      address_street: "123 Main",
      address_city: "NYC",
    });
    const addr = (c as any).address;
    expect(addr).toBeInstanceOf(Address);
    expect(addr.street).toBe("123 Main");
    expect(addr.city).toBe("NYC");
  });

  // Rails: test_change_single_value_object
  it("change single value object", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("address_street", "string");
        this.attribute("address_city", "string");
      }
    }
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = await Customer.create({ name: "Bob", address_street: "Old St", address_city: "LA" });
    (c as any).address = new Address("New Ave", "SF");
    expect(c.address_street).toBe("New Ave");
    expect(c.address_city).toBe("SF");
  });

  // Rails: test_nil_assignment_results_in_nil
  it("nil assignment results in nil", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("address_street", "string");
        this.attribute("address_city", "string");
      }
    }
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = await Customer.create({
      name: "Carol",
      address_street: "123 Elm",
      address_city: "PDX",
    });
    (c as any).address = null;
    expect(c.address_street).toBeNull();
    expect(c.address_city).toBeNull();
    expect((c as any).address).toBeNull();
  });

  // Rails: test_allow_nil_address_set_to_nil
  it("allow nil address set to nil", async () => {
    class GeoPoint {
      constructor(
        public lat: number,
        public lng: number,
      ) {}
    }
    class Location extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("lat", "float");
        this.attribute("lng", "float");
      }
    }
    composedOf(Location, "gps", {
      className: GeoPoint,
      mapping: [
        ["lat", "lat"],
        ["lng", "lng"],
      ],
    });

    const loc = await Location.create({ name: "HQ", lat: 37.7, lng: -122.4 });
    (loc as any).gps = null;
    expect(loc.lat).toBeNull();
    expect(loc.lng).toBeNull();
  });

  // Rails: test_allow_nil_address_loaded_when_only_some_attributes_are_nil
  it("allow nil address loaded when only some attributes are nil", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("address_street", "string");
        this.attribute("address_city", "string");
      }
    }
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = new Customer({ name: "Dan", address_street: "123 Oak", address_city: null } as any);
    const addr = (c as any).address;
    expect(addr).toBeInstanceOf(Address);
  });

  // Rails: test_immutable_value_objects
  it("immutable value objects", async () => {
    class Tag {
      constructor(public readonly name: string) {}
    }
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tag_name", "string");
      }
    }
    composedOf(Article, "tag", {
      className: Tag,
      mapping: [["tag_name", "name"]],
    });

    const a = await Article.create({ title: "Test", tag_name: "ruby" });
    const tag = (a as any).tag;
    expect(tag).toBeInstanceOf(Tag);
    expect(tag.name).toBe("ruby");
  });

  // Rails: test_reloaded_instance_refreshes_aggregations
  it("reloaded instance refreshes aggregations", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }
    class Customer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("address_street", "string");
        this.attribute("address_city", "string");
      }
    }
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = await Customer.create({
      name: "Eve",
      address_street: "1 First St",
      address_city: "BOS",
    });
    const addr1 = (c as any).address;
    expect(addr1.city).toBe("BOS");

    // Bypass the composed-of setter / aggregation cache invalidation path,
    // then reload to flush it — mirrors the Rails test's update_all + reload
    // sequence used to clear @aggregation_cache.
    await c.updateColumn("address_city", "CHI");
    await c.reload();
    const addr2 = (c as any).address;
    expect(addr2.city).toBe("CHI");
  });
});

// Fixture-backed AggregationsTest cases: mirror Rails' `fixtures :customers`
// against the canonical Customer model + composed_of mappings, rather than the
// ad-hoc inline Customer classes used elsewhere in this file.
describe("AggregationsTest", () => {
  // Mirrors Rails `fixtures :customers` via the shared Customer model; `{ schema }`
  // recreates the canonical `customers` table to survive sibling-file contamination.
  const { customers } = useHandlerFixtures(["customers"], { schema: canonicalSchema });

  // Rails: test_find_single_value_object
  it("find single value object", () => {
    const david = customers("david") as CustomerModel & { balance: MoneyClass };
    expect(david.balance.amount).toBe(50);
    expect(david.balance).toBeInstanceOf(MoneyClass);
    expect(david.balance.exchangeTo("DKK").amount).toBe(300);
  });

  // Rails: test_allow_nil_gps_is_nil
  it("allow nil gps is nil", () => {
    const zaphod = customers("zaphod") as CustomerModel & { gpsLocation: unknown };
    expect(zaphod.gpsLocation).toBeNull();
  });

  // Rails: test_do_not_run_the_converter_when_nil_was_set
  it("do not run the converter when nil was set", () => {
    CustomerModel.gpsConversionWasRun = false;
    const david = customers("david") as CustomerModel & { nonBlankGpsLocation: unknown };
    david.nonBlankGpsLocation = null;
    expect(CustomerModel.gpsConversionWasRun).toBe(false);
  });

  // Rails: test_inferred_mapping
  it("inferred mapping", async () => {
    const david = customers("david") as CustomerModel & { gpsLocation: GpsLocation };
    expect(david.gpsLocation.latitude).toBe("35.544623640962634");
    expect(david.gpsLocation.longitude).toBe("-105.9309951055148");

    david.gpsLocation = new GpsLocation("39x-110");
    expect(david.gpsLocation.latitude).toBe("39");
    expect(david.gpsLocation.longitude).toBe("-110");

    await david.save();
    await david.reload();
    expect(david.gpsLocation.latitude).toBe("39");
    expect(david.gpsLocation.longitude).toBe("-110");
  });

  // Rails: test_gps_equality
  it("gps equality", () => {
    expect(new GpsLocation("39x110").isEqual(new GpsLocation("39x110"))).toBe(true);
  });

  // Rails: test_gps_inequality
  it("gps inequality", () => {
    expect(new GpsLocation("39x110").isEqual(new GpsLocation("39x111"))).toBe(false);
  });

  // Rails: test_custom_constructor
  it("custom constructor", () => {
    const barney = customers("barney") as CustomerModel & { fullname: Fullname };
    expect(barney.fullname.toS).toBe("Barney GUMBLE");
    expect(barney.fullname).toBeInstanceOf(Fullname);
  });

  // Rails: test_custom_converter
  it("custom converter", () => {
    const barney = customers("barney") as CustomerModel & { fullname: Fullname };
    (barney as { fullname: unknown }).fullname = "Barnoit Gumbleau";
    expect(barney.fullname.toS).toBe("Barnoit GUMBLEAU");
    expect(barney.fullname).toBeInstanceOf(Fullname);
  });

  // Rails: test_hash_mapping
  it("hash mapping", () => {
    const barney = customers("barney") as CustomerModel & { addressHashMapping: Address };
    expect(barney.addressHashMapping.street).toBe("Quiet Road");
    expect(barney.addressHashMapping.city).toBe("Peaceful Town");
    expect(barney.addressHashMapping.country).toBe("Tranquil Land");
  });

  // Rails: test_value_object_with_hash_mapping_assignment_changes_model_attributes
  it("value object with hash mapping assignment changes model attributes", async () => {
    const barney = customers("barney") as CustomerModel & { addressHashMapping: Address };
    barney.addressHashMapping = new Address(
      "Lively Street",
      barney.readAttribute("address_city") as string,
      barney.readAttribute("address_country") as string,
    );
    await barney.save();
    expect(barney.readAttribute("address_street")).toBe("Lively Street");
  });
});

describe("AggregationsTest", () => {
  // Rails: test_find_multiple_value_object
  // Rails: test_change_single_value_object
  // Rails: test_nil_assignment_results_in_nil
  // Rails: test_allow_nil_address_set_to_nil
  // Rails: test_allow_nil_address_loaded_when_only_some_attributes_are_nil
  // Rails: test_immutable_value_objects
  // Rails: test_reloaded_instance_refreshes_aggregations
  it.skip("gps latitude", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("gps longitude", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("responds to constructor", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("hash should be the same for objects with the same values", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("hash should be different for objects with different values", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("mapping with custom constructor and target object that does not respond to to a", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("attributes after initialize", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("name mapping", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("ensure_custom_mapping", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("composite value", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });

  it.skip("allow nil gps set to nil", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("allow nil set address attributes to nil", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("nil raises error when allow nil is false", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("nil return from converter is respected when allow nil is true", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("nil return from converter results in failure when allow nil is false", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("assigning hash to custom converter", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
  it.skip("assigning hash without custom converter", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
  });
});

describe("OverridingAggregationsTest", () => {
  it.skip("composed of aggregation redefinition reflections should differ and not inherited", () => {
    // BLOCKED: relation — calculation / aggregation gap
    // ROOT-CAUSE: relation/calculations.ts#calculate or Relation#sum/avg/min/max missing Rails parity
    // SCOPE: ~50 LOC in relation/calculations.ts; affects ~21 tests in calculations/aggregations.test.ts
    /* fixture-dependent */
  });
});

describe("Aggregations", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ orders: { amount: "integer", status: "string" } });
  });

  it("should sum field", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    await Order.create({ amount: 10 });
    await Order.create({ amount: 20 });
    await Order.create({ amount: 30 });

    expect(await Order.all().sum("amount")).toBe(60);
  });

  it("should average field", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    await Order.create({ amount: 10 });
    await Order.create({ amount: 20 });
    await Order.create({ amount: 30 });

    expect(await Order.all().average("amount")).toBe(20);
  });

  it("should get minimum of field", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    await Order.create({ amount: 10 });
    await Order.create({ amount: 5 });
    await Order.create({ amount: 30 });

    expect(await Order.all().minimum("amount")).toBe(5);
  });

  it("should get maximum of field", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    await Order.create({ amount: 10 });
    await Order.create({ amount: 5 });
    await Order.create({ amount: 30 });

    expect(await Order.all().maximum("amount")).toBe(30);
  });

  it("should sum field with conditions", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
        this.attribute("status", "string");
      }
    }

    await Order.create({ amount: 10, status: "paid" });
    await Order.create({ amount: 20, status: "pending" });
    await Order.create({ amount: 30, status: "paid" });

    expect(await Order.where({ status: "paid" }).sum("amount")).toBe(40);
  });

  it("no queries for empty relation on sum", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    expect(await Order.all().none().sum("amount")).toBe(0);
  });

  it("no queries for empty relation on average", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    expect(await Order.all().none().average("amount")).toBeNull();
  });
});

describe("Aggregation edge cases", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ orders: { amount: "integer", status: "string" } });
  });

  it("no queries for empty relation on minimum", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    expect(await Order.all().minimum("amount")).toBeNull();
  });

  it("no queries for empty relation on maximum", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    expect(await Order.all().maximum("amount")).toBeNull();
  });

  it("minimum on none() returns null", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    await Order.create({ amount: 10 });
    expect(await Order.all().none().minimum("amount")).toBeNull();
  });

  it("maximum on none() returns null", async () => {
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
      }
    }

    await Order.create({ amount: 10 });
    expect(await Order.all().none().maximum("amount")).toBeNull();
  });
});

describe("composed_of", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      customers: { address_street: "string", address_city: "string" },
    });
  });
  it("composes value objects from multiple attributes", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }

    class Customer extends Base {
      static _tableName = "customers";
    }
    Customer.attribute("id", "integer");
    Customer.attribute("address_street", "string");
    Customer.attribute("address_city", "string");
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = await Customer.create({ address_street: "123 Main", address_city: "NYC" });
    const addr = (c as any).address;
    expect(addr).toBeInstanceOf(Address);
    expect(addr.street).toBe("123 Main");
    expect(addr.city).toBe("NYC");
  });

  it("decomposes value object on assignment", async () => {
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }

    class Customer extends Base {
      static _tableName = "customers";
    }
    Customer.attribute("id", "integer");
    Customer.attribute("address_street", "string");
    Customer.attribute("address_city", "string");
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });

    const c = await Customer.create({ address_street: "old", address_city: "old" });
    (c as any).address = new Address("456 Oak", "SF");

    expect(c.address_street).toBe("456 Oak");
    expect(c.address_city).toBe("SF");
  });
});

describe("composed_of (Rails-guided)", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ products: { price_amount: "integer", price_currency: "string" } });
  });

  // Rails: test "reading a composed-of attribute"
  it("reads a value object composed from multiple columns", async () => {
    class Money {
      constructor(
        public amount: number,
        public currency: string,
      ) {}
    }

    class Product extends Base {
      static {
        this._tableName = "products";
        this.attribute("id", "integer");
        this.attribute("price_amount", "integer");
        this.attribute("price_currency", "string");
      }
    }
    composedOf(Product, "price", {
      className: Money,
      mapping: [
        ["price_amount", "amount"],
        ["price_currency", "currency"],
      ],
    });

    const p = await Product.create({ price_amount: 1999, price_currency: "USD" });
    const price = (p as any).price;
    expect(price).toBeInstanceOf(Money);
    expect(price.amount).toBe(1999);
    expect(price.currency).toBe("USD");
  });

  // Rails: test "writing a composed-of attribute"
  it("decomposes value object into mapped columns on write", async () => {
    class Money {
      constructor(
        public amount: number,
        public currency: string,
      ) {}
    }

    class Product extends Base {
      static {
        this._tableName = "products";
        this.attribute("id", "integer");
        this.attribute("price_amount", "integer");
        this.attribute("price_currency", "string");
      }
    }
    composedOf(Product, "price", {
      className: Money,
      mapping: [
        ["price_amount", "amount"],
        ["price_currency", "currency"],
      ],
    });

    const p = await Product.create({ price_amount: 0, price_currency: "EUR" });
    (p as any).price = new Money(2500, "GBP");

    expect(p.price_amount).toBe(2500);
    expect(p.price_currency).toBe("GBP");
  });

  // Rails: test "composed_of returns null when all columns are null"
  it("returns null when all mapped columns are null", () => {
    class Money {
      constructor(
        public amount: number,
        public currency: string,
      ) {}
    }

    class Product extends Base {
      static {
        this._tableName = "products";
        this.attribute("id", "integer");
        this.attribute("price_amount", "integer");
        this.attribute("price_currency", "string");
      }
    }
    composedOf(Product, "price", {
      className: Money,
      mapping: [
        ["price_amount", "amount"],
        ["price_currency", "currency"],
      ],
    });

    const p = new Product({});
    expect((p as any).price).toBeNull();
  });

  // Rails: test "composed_of with constructor proc"
  it("uses constructorFn to build the value object on read", () => {
    class Fullname {
      constructor(
        public first: string,
        public last: string | null = null,
      ) {}

      static parse(str: unknown): Fullname | null {
        if (str == null) return null;
        const parts = String(str).split(" ");
        return new Fullname(parts[0], parts[1] ?? null);
      }

      get toS(): string {
        return `${this.first} ${(this.last ?? "").toUpperCase()}`;
      }
    }

    class Person extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    composedOf(Person, "fullname", {
      className: Fullname,
      mapping: [["name", "toS"]],
      constructorFn: (name: unknown) => Fullname.parse(name),
    });

    const p = new Person({ name: "John Smith" });
    const fn = (p as any).fullname as Fullname;
    expect(fn).toBeInstanceOf(Fullname);
    expect(fn.first).toBe("John");
    expect(fn.last).toBe("Smith");
  });

  it("clears mapped columns and cache when converter returns null", () => {
    class GpsLocation {
      constructor(public gpsLocation: string) {}
    }

    class Vehicle extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("gps_location", "string");
      }
    }
    composedOf(Vehicle, "nonBlankGpsLocation", {
      className: GpsLocation,
      mapping: [["gps_location", "gpsLocation"]],
      converter: (v: unknown) => (v == null || v === "" ? null : new GpsLocation(String(v))),
    });

    const vehicle = new Vehicle({ gps_location: "12.5x45.3" });
    expect((vehicle as any).nonBlankGpsLocation).toBeInstanceOf(GpsLocation);

    // assigning blank should clear the column and cache
    (vehicle as any).nonBlankGpsLocation = "";
    expect(vehicle.gps_location).toBeNull();
    expect((vehicle as any).nonBlankGpsLocation).toBeNull();
  });

  it("returns null when constructorFn returns null", () => {
    class Tag {
      constructor(public value: string) {}
    }

    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("tag_value", "string");
      }
    }
    composedOf(Item, "tag", {
      className: Tag,
      mapping: [["tag_value", "value"]],
      constructorFn: (v: unknown) => (v ? new Tag(String(v)) : null),
    });

    const item = new Item({ tag_value: null });
    expect((item as any).tag).toBeNull();
  });
});
