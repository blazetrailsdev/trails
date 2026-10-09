import { describe, it, expect } from "vitest";
import { lookupCastTypeFromColumn } from "./quoting.js";

describe("PostgreSQL::Quoting#lookup_cast_type_from_column on a cold type map", () => {
  it("raises off the unset map and leaves the failed verify handled", async () => {
    let verified = 0;
    const connection = {
      typeMap: null as never,
      verifyBang: () => {
        verified += 1;
        return Promise.reject(new Error("connection refused"));
      },
    };
    const column = { oid: 23, fmod: -1, sqlType: "integer" };

    expect(() => lookupCastTypeFromColumn.call(connection, column as never)).toThrow(TypeError);
    expect(verified).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
