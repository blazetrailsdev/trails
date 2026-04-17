import { describe, expect, it } from "vitest";

import { StringKeyedHashAccessor } from "../../../store.js";
import { Hstore } from "./hstore.js";

describe("PostgreSQL::OID::Hstore", () => {
  it("accessor returns StringKeyedHashAccessor", () => {
    // Rails: def accessor; ActiveRecord::Store::StringKeyedHashAccessor; end.
    // The accessor class coerces keys to strings on write so PG's
    // text-only hstore keys round-trip safely.
    expect(new Hstore().accessor()).toBe(StringKeyedHashAccessor);
  });
});
