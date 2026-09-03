import { describe, expect, it } from "vitest";

import { castBackendNameToModule } from "./xml-mini.js";

describe("XmlMini backends", () => {
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

describe("Nokogiri XmlMini backends", () => {
  for (const name of ["Nokogiri", "NokogiriSAX"]) {
    it(`throws on malformed xml under ${name}`, async () => {
      const backend = await castBackendNameToModule(name);
      await expect(async () => backend.parse("<root>")).rejects.toThrow();
    });

    it(`decodes entities in content under ${name}`, async () => {
      const backend = await castBackendNameToModule(name);
      const result = (await backend.parse("<root>&amp;&lt;&gt;</root>")) as {
        root: { __content__: string };
      };
      expect(result.root.__content__).toBe("&<>");
    });
  }
});
