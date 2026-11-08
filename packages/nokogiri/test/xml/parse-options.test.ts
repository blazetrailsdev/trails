import { describe, it, expect } from "vitest";

import { ParseOptions } from "../../lib/xml/parse-options.js";
import { XmlDocument } from "../../lib/xml/document.js";

type Dyn = Record<string, () => unknown>;

function camelize(name: string): string {
  return name.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

describe("Nokogiri::XML::TestParseOptions", () => {
  it("new", () => {
    const options = new ParseOptions();
    expect(options.options).toBe(0);
  });

  it("to i", () => {
    const options = new ParseOptions();
    expect(options.toI()).toBe(0);
  });

  for (const constant of Object.keys(ParseOptions).filter((k) => /^[A-Z]/.test(k))) {
    if (constant === "STRICT") continue;
    const name = camelize(constant);
    const predicate = `is${name[0].toUpperCase()}${name.slice(1)}`;
    it(`predicate ${constant.toLowerCase()}`, () => {
      const options = new ParseOptions(
        (ParseOptions as unknown as Record<string, number>)[constant],
      );
      expect((options as unknown as Dyn)[predicate]()).toBe(true);

      const chained = (new ParseOptions() as unknown as Dyn)[name]() as Dyn;
      expect(chained[predicate]()).toBe(true);
    });
  }

  it("strict noent", () => {
    const options = new ParseOptions().recover().noent();
    expect(options.isStrict()).toBe(false);
  });

  it("new with argument", () => {
    const options = new ParseOptions(1 << 1);
    expect(options.options).toBe(1 << 1);
  });

  it("unsetting", () => {
    const options = new ParseOptions(ParseOptions.DEFAULT_HTML);
    expect(options.isNonet()).toBe(true);
    expect(options.isRecover()).toBe(true);
    options.nononet().norecover();
    expect(options.isNonet()).toBe(false);
    expect(options.isRecover()).toBe(false);
    options.nonet().recover();
    expect(options.isNonet()).toBe(true);
    expect(options.isRecover()).toBe(true);
  });

  it("chaining", () => {
    const options = new ParseOptions().recover().noent();
    expect(options.isRecover()).toBe(true);
    expect(options.isNoent()).toBe(true);
  });

  it("inspect", () => {
    const options = new ParseOptions().recover().noent();
    const ins = options.inspect();
    expect(ins).toMatch(/recover/);
    expect(ins).toMatch(/noent/);
  });

  it("equality", () => {
    const options = new ParseOptions().recover().noent();
    const other = new ParseOptions().recover().noent();
    expect(options.equals(other)).toBe(true);
  });
});

describe("Nokogiri::XML::Document.parse (trails)", () => {
  it("parse yields the options to the block", () => {
    let yielded: ParseOptions | null = null;
    const doc = XmlDocument.parse("<root/>", null, null, ParseOptions.DEFAULT_XML, (o) => {
      yielded = o;
    });
    expect(yielded).toBeInstanceOf(ParseOptions);
    doc.dispose();
  });

  it("parse sets encoding on an empty recovered document", () => {
    expect(XmlDocument.parse("", null, "UTF-8").encoding).toBe("UTF-8");
  });

  it("parse reads an IO", () => {
    const doc = XmlDocument.parse({ read: () => "<root/>" });
    expect(doc.root.name).toBe("root");
    doc.dispose();
  });
});
