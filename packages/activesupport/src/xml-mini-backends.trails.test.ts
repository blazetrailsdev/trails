import { describe, expect, it } from "vitest";

import { castBackendNameToModule } from "./xml-mini.js";

/**
 * Ruby's `cast_backend_name_to_module` is
 * `require "active_support/xml_mini/#{name.downcase}"` (xml_mini.rb:200-206),
 * so its reachable set IS the directory listing. trails spells the set out in
 * `XML_MINI_BACKENDS`, which a new backend file could silently miss — these
 * cover the two halves of that: every ported file resolves, and the three
 * backends Rails ships that trails does not carry raise what their own Ruby
 * file raises.
 */
describe("XmlMini backends", () => {
  // Vite rewrites a LITERAL `import.meta.glob` call at transform time, so the
  // spelling has to stay as written; the repo's tsconfig omits `vite/client`,
  // which is the only thing that declares it.
  // @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
  const ported = Object.keys(import.meta.glob("./xml-mini/*.ts") as Record<string, unknown>)
    .map((path) => path.replace(/^\.\/xml-mini\//, "").replace(/\.ts$/, ""))
    .filter((name) => !/\.test$|-engine$|-readable$/.test(name));

  it("resolves every ported backend file by name", async () => {
    expect(ported.length).toBeGreaterThan(0);
    for (const name of ported) {
      const backend = await castBackendNameToModule(name);
      expect(typeof backend.parse).toBe("function");
    }
  });

  it("raises what the Ruby file raises for the backends trails does not carry", async () => {
    await expect(castBackendNameToModule("JDOM")).rejects.toThrow(
      "JRuby is required to use the JDOM backend for XmlMini",
    );
    for (const name of ["LibXML", "LibXMLSAX"]) {
      await expect(castBackendNameToModule(name)).rejects.toThrow(
        "cannot load such file -- libxml",
      );
    }
  });
});
