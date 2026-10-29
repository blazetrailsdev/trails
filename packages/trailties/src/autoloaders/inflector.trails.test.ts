import { describe, expect, it } from "vitest";
import { Inflector } from "./inflector.js";

describe("Rails::Autoloaders::Inflector", () => {
  it("camelizes a basename through an inflect override before Active Support", () => {
    expect(Inflector.camelize("vcard_api", "/app/models/vcard_api")).toBe("VcardApi");
    Inflector.inflect({ vcard_api: "VCardAPI" });
    expect(Inflector.camelize("vcard_api", "/app/models/vcard_api")).toBe("VCardAPI");
  });
});
