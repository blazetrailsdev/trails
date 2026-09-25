import { describe, it, expect } from "vitest";
import { adapterDouble } from "./adapter-double.js";

describe("adapterDouble", () => {
  it("answers the connection pool's checkout protocol", async () => {
    const double = adapterDouble();

    expect(double.owner).toBeNull();
    expect(double.isInUse()).toBeFalsy();
    double.lease();
    expect(double.isInUse()).toBeTruthy();
    await double.verifyBang();
    double.stealBang();
    double.expire();
    expect(double.isInUse()).toBeFalsy();
    expect(typeof double._runCheckoutCallbacks).toBe("function");
  });

  it("lets an override shadow a getter-only member", () => {
    const cache = { isCached: () => true };
    const double = adapterDouble({ internalSchemaCache: cache });

    expect(double.internalSchemaCache).toBe(cache);
  });
});
