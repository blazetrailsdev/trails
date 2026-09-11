import { describe, it, expect } from "vitest";
import { File } from "@blazetrails/ruby-compat";

import { RawFile } from "./raw-file.js";
import { Renderable } from "./renderable.js";

describe("Template::RawFile", () => {
  it("reports the file's identifier and derives its type from the extension", () => {
    const template = new RawFile("/tmp/pdf-report.pdf");
    expect(template.identifier).toBe("/tmp/pdf-report.pdf");
    expect(template.format).toBe("pdf");
  });

  it("renders the file's contents", () => {
    const path = `${File.dirname(new URL(import.meta.url).pathname)}/raw-file.trails.test.ts`;
    expect(new RawFile(path).render()).toContain("renders the file's contents");
  });
});

describe("Template::Renderable", () => {
  it("delegates to the object's renderIn and reports its class as the identifier", () => {
    class Component {
      renderIn(context: unknown): string {
        return `rendered ${String(context)}`;
      }
    }
    const template = new Renderable(new Component());
    expect(template.identifier()).toBe("Component");
    expect(template.render("view")).toBe("rendered view");
  });

  it("raises ArgumentError when the object does not implement renderIn", () => {
    expect(() => new Renderable({}).render("view")).toThrow(
      /is not a renderable object\. It must implement #render_in\./u,
    );
  });
});
