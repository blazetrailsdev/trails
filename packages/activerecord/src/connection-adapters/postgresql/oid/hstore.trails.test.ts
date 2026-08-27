import { describe, expect, it } from "vitest";

import { StringKeyedHashAccessor } from "../../../store.js";
import { Hstore } from "./hstore.js";

describe("PostgreSQL::OID::Hstore", () => {
  it("accessor returns StringKeyedHashAccessor", () => {
    expect(new Hstore().accessor()).toBe(StringKeyedHashAccessor);
  });
});
