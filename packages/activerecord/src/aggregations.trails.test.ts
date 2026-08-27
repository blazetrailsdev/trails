import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { registerConstant, unregisterConstant } from "@blazetrails/activesupport";

import { Base } from "./index.js";
import { composedOf } from "./aggregations.js";
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
          composedOf(this, "gpsLocation", { mapping: ["gpsLocation", "gpsLocation"] });
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
