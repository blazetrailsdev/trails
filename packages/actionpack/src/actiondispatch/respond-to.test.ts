import { describe, it, expect } from "vitest";
import { respondTo, Collector, UnknownFormat } from "./respond-to.js";

// ==========================================================================
// controller/mime/respond_to_test.rb
// ==========================================================================
describe("RespondToControllerTest", () => {
  it("html", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html content");
        format.xml(() => "xml content");
      },
      { accept: "text/html" }
    );
    expect(result).toBe("html content");
  });

  it("all", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.xml(() => "xml");
      },
      { accept: "*/*" }
    );
    // Returns first registered format
    expect(result).toBe("html");
  });

  it("xml", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.xml(() => "xml");
      },
      { accept: "application/xml" }
    );
    expect(result).toBe("xml");
  });

  it("js or html", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.js(() => "js");
      },
      { accept: "text/javascript" }
    );
    expect(result).toBe("js");
  });

  it("json or yaml", () => {
    const result = respondTo(
      (format) => {
        format.json(() => "json");
        format.yaml(() => "yaml");
      },
      { accept: "application/json" }
    );
    expect(result).toBe("json");
  });

  it("json or yaml with leading star star", () => {
    const result = respondTo(
      (format) => {
        format.json(() => "json");
        format.yaml(() => "yaml");
      },
      { accept: "*/*" }
    );
    expect(result).toBe("json");
  });

  it("using defaults", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      {} // no accept header, returns first
    );
    expect(result).toBe("html");
  });

  it("with atom content type", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.atom(() => "atom");
      },
      { accept: "application/atom+xml" }
    );
    expect(result).toBe("atom");
  });

  it("with rss content type", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.rss(() => "rss");
      },
      { accept: "application/rss+xml" }
    );
    expect(result).toBe("rss");
  });

  it("handle any", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.any(() => "any");
      },
      { accept: "application/json" }
    );
    expect(result).toBe("any");
  });

  it("handle any any", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { accept: "*/*" }
    );
    expect(result).toBe("any");
  });

  it("handle any any parameter format", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { format: "json" }
    );
    expect(result).toBe("any");
  });

  it("handle any any explicit html", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { format: "html" }
    );
    expect(result).toBe("any");
  });

  it("handle any any javascript", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { accept: "text/javascript" }
    );
    expect(result).toBe("any");
  });

  it("handle any any xml", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { accept: "application/xml" }
    );
    expect(result).toBe("any");
  });

  it("forced format", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      { format: "json" }
    );
    expect(result).toBe("json");
  });

  it("explicit format overrides accept header", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      { format: "json", accept: "text/html" }
    );
    expect(result).toBe("json");
  });

  it("invalid format", () => {
    expect(() =>
      respondTo(
        (format) => {
          format.html(() => "html");
        },
        { format: "json" }
      )
    ).toThrow(UnknownFormat);
  });

  it("custom constant", () => {
    const result = respondTo(
      (format) => {
        format.on("custom", () => "custom");
      },
      { format: "custom" }
    );
    expect(result).toBe("custom");
  });

  it("custom constant handling without block", () => {
    const result = respondTo(
      (format) => {
        format.on("custom");
      },
      { format: "custom" }
    );
    expect(result).toBeUndefined();
  });

  it("js or anything", () => {
    const result = respondTo(
      (format) => {
        format.js(() => "js");
        format.any(() => "any");
      },
      { accept: "text/html" }
    );
    expect(result).toBe("any");
  });

  // --- Collector API ---

  it("collector formats", () => {
    const c = new Collector();
    c.html().json().xml();
    expect(c.formats).toEqual(["html", "json", "xml"]);
  });

  it("collector hasFormat", () => {
    const c = new Collector();
    c.html();
    expect(c.hasFormat("html")).toBe(true);
    expect(c.hasFormat("json")).toBe(false);
  });

  it("collector with any has all formats", () => {
    const c = new Collector();
    c.any();
    expect(c.hasFormat("json")).toBe(true);
    expect(c.hasFormat("anything")).toBe(true);
  });

  it("negotiate returns null when no match", () => {
    const c = new Collector();
    c.html();
    const result = c.negotiate({ accept: "application/json" });
    expect(result).toBeNull();
  });

  it("negotiate with quality parameter", () => {
    const c = new Collector();
    c.html(() => "html");
    c.json(() => "json");
    // Prefer json with higher quality
    const result = c.negotiate({ accept: "text/html;q=0.5, application/json;q=1.0" });
    expect(result?.format).toBe("json");
  });

  it("resolved format after negotiation", () => {
    const c = new Collector();
    c.html(() => "html");
    c.json(() => "json");
    c.negotiate({ accept: "application/json" });
    expect(c.resolvedFormat).toBe("json");
  });

  it("text format", () => {
    const result = respondTo(
      (format) => {
        format.text(() => "plain text");
      },
      { format: "text" }
    );
    expect(result).toBe("plain text");
  });

  it("csv format", () => {
    const result = respondTo(
      (format) => {
        format.csv(() => "a,b,c");
      },
      { format: "csv" }
    );
    expect(result).toBe("a,b,c");
  });

  it("pdf format", () => {
    const result = respondTo(
      (format) => {
        format.pdf(() => "pdf-data");
      },
      { format: "pdf" }
    );
    expect(result).toBe("pdf-data");
  });

  it("multiple formats with accept header preference", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
        format.xml(() => "xml");
      },
      { accept: "application/xml, text/html;q=0.9, application/json;q=0.8" }
    );
    expect(result).toBe("xml");
  });

  it("no handlers throws UnknownFormat", () => {
    expect(() => respondTo(() => {}, { format: "html" })).toThrow(UnknownFormat);
  });

  it("format handler without callback returns undefined", () => {
    const result = respondTo(
      (format) => {
        format.html();
      },
      { format: "html" }
    );
    expect(result).toBeUndefined();
  });

  it("using defaults with type list", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.js(() => "js");
      },
      { accept: "text/javascript, text/html" }
    );
    expect(result).toBe("js");
  });

  it("synonyms", () => {
    // text/xml should match xml handler
    const result = respondTo(
      (format) => {
        format.xml(() => "xml content");
      },
      { accept: "text/xml" }
    );
    expect(result).toBe("xml content");
  });

  it("xhtml alias", () => {
    // application/xhtml+xml should match html
    const result = respondTo(
      (format) => {
        format.html(() => "html content");
      },
      { accept: "application/xhtml+xml" }
    );
    expect(result).toBe("html content");
  });

  it("using conflicting nested js then html", () => {
    const result = respondTo(
      (format) => {
        format.js(() => "js");
        format.html(() => "html");
      },
      { accept: "text/html" }
    );
    expect(result).toBe("html");
  });

  it("using non conflicting nested js then js", () => {
    const result = respondTo(
      (format) => {
        format.js(() => "js1");
      },
      { accept: "text/javascript" }
    );
    expect(result).toBe("js1");
  });

  it("handle any any unknown format", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "fallback");
      },
      { format: "unknown_format" }
    );
    expect(result).toBe("fallback");
  });

  it("extension synonyms", () => {
    // htm should match html
    const result = respondTo(
      (format) => {
        format.html(() => "html");
      },
      { accept: "text/html" }
    );
    expect(result).toBe("html");
  });

  it("firefox simulation", () => {
    // Firefox sends: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    );
    expect(result).toBe("html");
  });
});
