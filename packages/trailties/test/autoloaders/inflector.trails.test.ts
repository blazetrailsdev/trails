import { describe, expect, it } from "vitest";
import { Inflector } from "../../lib/autoloaders/inflector.js";

describe("Trails::Autoloaders::Inflector", () => {
  it("camelizes a basename through an inflect override before Active Support", () => {
    expect(Inflector.camelize("vcard_api", "/app/models/vcard_api")).toBe("VcardApi");
    Inflector.inflect({ vcard_api: "VCardAPI" });
    expect(Inflector.camelize("vcard_api", "/app/models/vcard_api")).toBe("VCardAPI");
  });
});
