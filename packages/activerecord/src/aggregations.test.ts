import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Base, composedOf, reflectOnAggregation } from "./index.js";
import { reload as persistenceReload } from "./persistence.js";

import { fixtures } from "./test-fixtures.js";
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

describe("AggregationsTest", () => {
  const { customers } = fixtures(["customers"]);

  it("find single value object", () => {
    const david = customers("david") as CustomerModel & { balance: MoneyClass };
    expect(david.balance.amount).toBe(50);
    expect(david.balance).toBeInstanceOf(MoneyClass);
    expect(david.balance.exchangeTo("DKK").amount).toBe(300);
  });

  it("find multiple value object", () => {
    const david = customers("david") as CustomerModel & { address: Address };
    expect(david.address.street).toBe(david.readAttribute("address_street"));
    expect(
      david.address.closeToQ(
        new Address(
          "Different Street",
          david.readAttribute("address_city") as string,
          david.readAttribute("address_country") as string,
        ),
      ),
    ).toBe(true);
  });

  it("change single value object", async () => {
    const david = customers("david") as CustomerModel & { balance: MoneyClass };
    david.balance = new MoneyClass(100);
    await david.save();
    await david.reload();
    expect(david.balance.amount).toBe(100);
  });

  it("immutable value objects", () => {
    const david = customers("david") as CustomerModel & { balance: MoneyClass };
    expect(() => {
      (david.balance as { amount: number }).amount = 20;
    }).toThrow();

    david.balance = new MoneyClass(100);
    expect(() => {
      (david.balance as { amount: number }).amount = 20;
    }).toThrow();
  });

  it("reloaded instance refreshes aggregations", async () => {
    const david = customers("david") as CustomerModel & { gpsLocation: GpsLocation };
    expect(david.gpsLocation.latitude).toBe("35.544623640962634");
    expect(david.gpsLocation.longitude).toBe("-105.9309951055148");

    await CustomerModel.updateAll({ gps_location: "24x113" });
    await david.reload();
    expect(david.readAttribute("gps_location")).toBe("24x113");
    expect(david.gpsLocation.equals(new GpsLocation("24x113"))).toBe(true);
  });

  it("allow nil address set to nil", async () => {
    const zaphod = customers("zaphod") as CustomerModel & { address: Address | null };
    zaphod.address = null;
    await zaphod.save();
    await zaphod.reload();
    expect(zaphod.address).toBeNull();
  });

  it("allow nil address loaded when only some attributes are nil", async () => {
    const zaphod = customers("zaphod") as CustomerModel & { address: Address };
    zaphod.writeAttribute("address_street", null);
    await zaphod.save();
    await zaphod.reload();
    expect(zaphod.address).toBeInstanceOf(Address);
    expect(zaphod.address.street).toBeNull();
  });

  it("nil assignment results in nil", () => {
    const david = customers("david") as CustomerModel & { gpsLocation: GpsLocation | null };
    david.gpsLocation = new GpsLocation("39x111");
    expect(david.gpsLocation).not.toBeNull();
    david.gpsLocation = null;
    expect(david.gpsLocation).toBeNull();
  });

  it("allow nil gps is nil", () => {
    const zaphod = customers("zaphod") as CustomerModel & { gpsLocation: unknown };
    expect(zaphod.gpsLocation).toBeNull();
  });

  it("do not run the converter when nil was set", () => {
    CustomerModel.gpsConversionWasRun = false;
    const david = customers("david") as CustomerModel & { nonBlankGpsLocation: unknown };
    david.nonBlankGpsLocation = null;
    expect(CustomerModel.gpsConversionWasRun).toBe(false);
  });

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

  it("gps equality", () => {
    expect(new GpsLocation("39x110").equals(new GpsLocation("39x110"))).toBe(true);
  });

  it("gps inequality", () => {
    expect(new GpsLocation("39x110").equals(new GpsLocation("39x111"))).toBe(false);
  });

  it("custom constructor", () => {
    const barney = customers("barney") as CustomerModel & { fullname: Fullname };
    expect(barney.fullname.toS).toBe("Barney GUMBLE");
    expect(barney.fullname).toBeInstanceOf(Fullname);
  });

  it("custom converter", () => {
    const barney = customers("barney") as CustomerModel & { fullname: Fullname };
    (barney as { fullname: unknown }).fullname = "Barnoit Gumbleau";
    expect(barney.fullname.toS).toBe("Barnoit GUMBLEAU");
    expect(barney.fullname).toBeInstanceOf(Fullname);
  });

  it("hash mapping", () => {
    const barney = customers("barney") as CustomerModel & { addressHashMapping: Address };
    expect(barney.addressHashMapping.street).toBe("Quiet Road");
    expect(barney.addressHashMapping.city).toBe("Peaceful Town");
    expect(barney.addressHashMapping.country).toBe("Tranquil Land");
  });

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

  it("allow nil gps set to nil", async () => {
    const david = customers("david") as CustomerModel & { gpsLocation: GpsLocation | null };
    david.gpsLocation = null;
    await david.save();
    await david.reload();
    expect(david.gpsLocation).toBeNull();
  });

  it("allow nil set address attributes to nil", () => {
    const zaphod = customers("zaphod") as CustomerModel & { address: Address | null };
    zaphod.address = null;
    expect(zaphod.readAttribute("address_street")).toBeNull();
    expect(zaphod.readAttribute("address_city")).toBeNull();
    expect(zaphod.readAttribute("address_country")).toBeNull();
  });

  it("nil raises error when allow nil is false", () => {
    const david = customers("david");
    expect(() => {
      (david as any).balance = null;
    }).toThrow();
  });

  it("nil return from converter is respected when allow nil is true", async () => {
    CustomerModel.gpsConversionWasRun = false;
    try {
      const david = customers("david") as CustomerModel & {
        nonBlankGpsLocation: GpsLocation | null;
      };
      (david as any).nonBlankGpsLocation = "";
      await david.save();
      await david.reload();
      expect(david.nonBlankGpsLocation).toBeNull();
    } finally {
      CustomerModel.gpsConversionWasRun = false;
    }
  });

  it("nil return from converter results in failure when allow nil is false", () => {
    const barney = customers("barney") as CustomerModel & { gpsLocation: GpsLocation | null };
    expect(() => {
      (barney as any).gpsLocation = "";
    }).toThrow();
  });

  it("assigning hash to custom converter", () => {
    const barney = customers("barney") as CustomerModel & { fullname: Fullname };
    (barney as any).fullname = { first: "Barney", last: "Stinson" };
    expect(barney.readAttribute("name")).toBe("Barney STINSON");
  });

  it("assigning hash without custom converter", () => {
    const barney = customers("barney");
    const hash = { first: "Barney", last: "Stinson" };
    (barney as any).fullnameNoConverter = hash;
    expect(barney.readAttribute("name")).toBe(String(hash));
  });
});

describe("OverridingAggregationsTest", () => {
  it("composed of aggregation redefinition reflections should differ and not inherited", () => {
    class DifferentName {}
    class PersonBase extends Base {
      static {
        composedOf(this, "composedOf", {
          className: DifferentName,
          mapping: [["person_first_name", "firstName"]],
        });
      }
    }
    class DifferentPerson extends PersonBase {
      static {
        composedOf(this, "composedOf", {
          className: DifferentName,
          mapping: [["different_person_first_name", "firstName"]],
        });
      }
    }
    const personRef = reflectOnAggregation(PersonBase, "composedOf");
    const differentRef = reflectOnAggregation(DifferentPerson, "composedOf");
    expect(personRef).not.toBeNull();
    expect(differentRef).not.toBeNull();
    expect(personRef).not.toBe(differentRef);
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
    class Money {
      constructor(public amount: number) {}
    }
    class Priced extends Base {
      static {
        composedOf(this, "balance", { className: Money, mapping: [["balance", "amount"]] });
      }
    }
    expect(own(Priced, "reload")).toBe(true);
    expect(own(Priced, "initializeDup")).toBe(true);
    expect(Priced.prototype.reload).not.toBe(persistenceReload);
  });

  it("does not re-wrap a subclass whose superclass already declared composed_of", () => {
    class Money {
      constructor(public amount: number) {}
    }
    class Priced extends Base {
      static {
        composedOf(this, "balance", { className: Money, mapping: [["balance", "amount"]] });
      }
    }
    class SubPriced extends Priced {
      static {
        composedOf(this, "credit", { className: Money, mapping: [["credit", "amount"]] });
      }
    }
    expect(own(SubPriced, "reload")).toBe(false);
    expect(own(SubPriced, "initializeDup")).toBe(false);
    expect(SubPriced.prototype.reload).toBe(Priced.prototype.reload);
    expect(SubPriced.prototype.reload).not.toBe(persistenceReload);
  });
});
