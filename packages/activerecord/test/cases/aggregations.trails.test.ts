import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { TopLevel, constSet, constDefined, rbModRemoveConst } from "@blazetrails/ruby-compat";

import { Base } from "../../lib/index.js";
import { reload as persistenceReload } from "../../lib/persistence.js";
import {
  reload as aggregationsReload,
  initializeDup as aggregationsInitializeDup,
} from "../../lib/aggregations.js";
import { fixtures } from "../support/use-fixtures.js";
import { Customer as CustomerModel, Money as MoneyClass } from "../models/customer.js";

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
    constSet(TopLevel, "GpsLocation", GpsLocation);
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
      if (constDefined(Object, "GpsLocation", false)) rbModRemoveConst(Object, "GpsLocation");
    }
  });
});

describe("lazy composed_of inclusion", () => {
  const own = (klass: typeof Base, key: string): boolean => Object.hasOwn(klass.prototype, key);

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

  it("init_internals reaches Base's chain through super (aggregations.rb:21-24)", () => {
    expect(own(CustomerModel, "initInternals")).toBe(true);
    expect(CustomerModel.prototype.initInternals).not.toBe(Base.prototype.initInternals);
    const customer = new CustomerModel() as unknown as Record<string, unknown>;
    expect(customer._aggregationCache).toEqual(new Map());
    expect(customer._readonly).toBe(false);
    expect(customer._associationCache).toEqual(new Map());
    expect(customer._triggerUpdateCallback).toBe(null);
    expect(customer._touchAttrNames).toBe(null);
    expect(customer._touchRecord).toBe(null);
    expect(customer._alreadyCalled).toBe(null);
    expect(customer._committedAlreadyCalled).toBe(null);
    expect(customer._deferTouchAttrs).toBe(null);
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
    expect(own(Priced, "reload")).toBe(true);
    expect(Object.getPrototypeOf(SubPriced.prototype)).toBe(Priced.prototype);
  });
});
