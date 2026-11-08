import { describe, expect, it } from "vitest";
import { DNS_NAMESPACE, uuidV5 } from "../../../lib/core-ext/digest/uuid.js";

describe("DigestUUIDExt", () => {
  it("accepts a copied namespace byte array", () => {
    expect(uuidV5(Uint8Array.from(DNS_NAMESPACE), "www.widgets.com")).toEqual(
      uuidV5(DNS_NAMESPACE, "www.widgets.com"),
    );
  });
});
