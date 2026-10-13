import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";

import { Base } from "./index.js";
import { reload as persistenceReload } from "./persistence.js";
import {
  reload as aggregationsReload,
  initializeDup as aggregationsInitializeDup,
} from "./aggregations.js";
import { fixtures } from "./test-fixtures.js";
import { Customer as CustomerModel, Money as MoneyClass } from "./test-helpers/models/customer.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("AggregationsTest (trails)", () => {
  const { customers } = fixtures(["customers"]);

  it("builds the value object when allow nil is false and every mapped attribute is nil", () => {
    const david = customers("david") as CustomerModel & {
      balance: InstanceType<typeof MoneyClass> | null;
    };
    david.writeAttribute("balance", null);

    expect(david.balance).toBeInstanceOf(MoneyClass);
    expect(david.balance?.amount).toBeNull();
  });

  it("infers the value-object class name from the aggregation name", () => {
    class GpsLocation {
      constructor(public gpsLocation: string | null) {}
    }
    registerConstant("GpsLocation", GpsLocation);
    try {
      class Customer extends Base {
        static {
          this.attribute("gpsLocation", "string");
          this.composedOf("gpsLocation", { mapping: ["gpsLocation", "gpsLocation"] });
        }
      }
      const customer = new Customer();
      customer.writeAttribute("gpsLocation", "39x-110");

      expect((customer as unknown as { gpsLocation: GpsLocation }).gpsLocation).toBeInstanceOf(
        GpsLocation,
      );
      expect((customer as unknown as { gpsLocation: GpsLocation }).gpsLocation.gpsLocation).toBe(
        "39x-110",
      );
    } finally {
      unregisterConstant("GpsLocation", GpsLocation);
    }
  });
});

describe("lazy composed_of inclusion", () => {
  const own = (klass: typeof Base, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(klass.prototype, key);

  it("does not mix Aggregations onto models without composed_of", () => {
    class Plain extends Base {}
    expect(own(Plain, "reload")).toBe(false);
    expect(own(Plain, "initializeDup")).toBe(false);
    expect(Plain.prototype.reload).toBe(Base.prototype.reload);
    expect(Plain.prototype.reload).not.toBe(persistenceReload);
  });

  it("mixes Aggregations onto a model that declares composed_of", () => {
    class Priced extends Base {
      static {
        this.composedOf("balance", { className: "Money", mapping: [["balance", "amount"]] });
      }
    }
    expect(Priced.prototype.reload).toBe(aggregationsReload);
    expect(Priced.prototype.initializeDup).toBe(aggregationsInitializeDup);
    expect(Priced.prototype.reload).not.toBe(persistenceReload);
  });

  it("does not re-wrap a subclass whose superclass already declared composed_of", () => {
    class Priced extends Base {
      static {
        this.composedOf("balance", { className: "Money", mapping: [["balance", "amount"]] });
      }
    }
    class SubPriced extends Priced {
      static {
        this.composedOf("credit", { className: "Money", mapping: [["credit", "amount"]] });
      }
    }
    expect(own(SubPriced, "reload")).toBe(false);
    expect(own(SubPriced, "initializeDup")).toBe(false);
    expect(SubPriced.prototype.reload).toBe(Priced.prototype.reload);
    expect(SubPriced.prototype.reload).not.toBe(persistenceReload);
    expect(Object.getPrototypeOf(Priced.prototype)).not.toBe(Base.prototype);
    expect(Object.getPrototypeOf(SubPriced.prototype)).toBe(Priced.prototype);
  });
});
