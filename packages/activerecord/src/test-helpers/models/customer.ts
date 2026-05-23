// vendor/rails/activerecord/test/models/customer.rb
import { composedOf } from "../../aggregations.js";
import { Base } from "../../base.js";

export class Address {
  street: string;
  city: string;
  country: string;

  constructor(street: string, city: string, country: string) {
    this.street = street;
    this.city = city;
    this.country = country;
  }

  closeToQ(otherAddress: Address): boolean {
    return this.city === otherAddress.city && this.country === otherAddress.country;
  }

  isEqual(other: unknown): boolean {
    if (!(other instanceof Address)) return false;
    return (
      other.street === this.street && other.city === this.city && other.country === this.country
    );
  }
}

export class Money {
  amount: number;
  currency: string;

  static EXCHANGE_RATES: Record<string, number> = { USD_TO_DKK: 6, DKK_TO_USD: 0.6 };

  constructor(amount: number, currency = "USD") {
    this.amount = amount;
    this.currency = currency;
  }

  exchangeTo(otherCurrency: string): Money {
    return new Money(
      Math.floor(this.amount * Money.EXCHANGE_RATES[`${this.currency}_TO_${otherCurrency}`]),
      otherCurrency,
    );
  }
}

export class GpsLocation {
  gpsLocation: string;

  constructor(gpsLocation: string) {
    this.gpsLocation = gpsLocation;
  }

  get latitude(): string {
    return this.gpsLocation.split("x")[0] ?? "";
  }

  get longitude(): string {
    return this.gpsLocation.split("x")[1] ?? "";
  }

  isEqual(other: GpsLocation): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }
}

export class Fullname {
  first: string;
  last: string | null;

  static parse(str: unknown): Fullname | null {
    if (str == null) return null;
    if (typeof str === "object" && str !== null) {
      const h = str as Record<string, string>;
      return new Fullname(h["first"], h["last"] ?? null);
    }
    const parts = String(str).split(" ");
    return new Fullname(parts[0], parts[1] ?? null);
  }

  constructor(first: string, last: string | null = null) {
    this.first = first;
    this.last = last;
  }

  get toS(): string {
    return `${this.first} ${(this.last ?? "").toUpperCase()}`;
  }

  toString(): string {
    return this.toS;
  }
}

export class Customer extends Base {
  static gpsConversionWasRun = false;

  static {
    composedOf(this, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
        ["address_country", "country"],
      ],
    });
    composedOf(this, "addressHashMapping", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
        ["address_country", "country"],
      ],
    });
    composedOf(this, "balance", {
      className: Money,
      mapping: [["balance", "amount"]],
    });
    composedOf(this, "gpsLocation", {
      className: GpsLocation,
      mapping: [["gps_location", "gpsLocation"]],
    });
    composedOf(this, "nonBlankGpsLocation", {
      className: GpsLocation,
      mapping: [["gps_location", "gpsLocation"]],
      converter: (gps: unknown) => {
        Customer.gpsConversionWasRun = true;
        if (gps == null || gps === "") return null;
        return new GpsLocation(String(gps));
      },
    });
    composedOf(this, "fullname", {
      className: Fullname,
      mapping: [["name", "toS"]],
      constructorFn: (name: unknown) => Fullname.parse(name),
      converter: (v: unknown) => Fullname.parse(v),
    });
    composedOf(this, "fullnameNoConverter", {
      className: Fullname,
      mapping: [["name", "toS"]],
    });
  }
}
