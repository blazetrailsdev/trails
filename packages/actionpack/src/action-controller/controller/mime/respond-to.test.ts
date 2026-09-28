import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { respondTo, Collector } from "../../../action-dispatch/respond-to.js";
import { Request } from "../../../action-dispatch/http/request.js";
import { Response } from "../../../action-dispatch/http/response.js";
import { Base } from "../../base.js";
import { MissingExactTemplate, UnknownFormat } from "../../metal/exceptions.js";
import type { VariantCollector } from "../../metal/mime-responds.js";
import { TestCase } from "../../test-case.js";

type Variants = VariantCollector & Record<string, (block?: () => unknown) => void>;

class RespondToController extends Base {
  async variantWithImplicitTemplateRendering(): Promise<void> {}
  async variantWithoutImplicitTemplateRendering(): Promise<void> {}

  async variantWithFormatAndCustomRender(): Promise<void> {
    this.request.variant = ":mobile";

    await this.respondTo((type) => {
      type.html(() => this.render({ body: "mobile" }));
    });
  }

  async multipleVariantsForFormat(): Promise<void> {
    await this.respondTo((type) => {
      type.html((html: VariantCollector) => {
        (html as Variants).tablet(() => this.render({ body: "tablet" }));
        (html as Variants).phone(() => this.render({ body: "phone" }));
      });
    });
  }

  async variantPlusNoneForFormat(): Promise<void> {
    await this.respondTo((format) => {
      format.html((variant: VariantCollector) => {
        (variant as Variants).phone(() => this.render({ body: "phone" }));
        (variant as Variants).none();
      });
    });
  }

  async variantInlineSyntax(): Promise<void> {
    await this.respondTo((format) => {
      format.js(() => this.render({ body: "js" }));
      (format.html() as Variants).none(() => this.render({ body: "none" }));
      (format.html() as Variants).phone(() => this.render({ body: "phone" }));
    });
  }

  async variantAny(): Promise<void> {
    await this.respondTo((format) => {
      format.html((variant: VariantCollector) => {
        variant.any(":tablet", ":phablet", () => this.render({ body: "any" }));
        (variant as Variants).phone(() => this.render({ body: "phone" }));
      });
    });
  }

  async variantAnyAny(): Promise<void> {
    await this.respondTo((format) => {
      format.html((variant: VariantCollector) => {
        variant.any(() => this.render({ body: "any" }));
        (variant as Variants).phone(() => this.render({ body: "phone" }));
      });
    });
  }

  async variantInlineAny(): Promise<void> {
    await this.respondTo((format) => {
      (format.html() as Variants).any(":tablet", ":phablet", () => this.render({ body: "any" }));
      (format.html() as Variants).phone(() => this.render({ body: "phone" }));
    });
  }

  async variantInlineAnyAny(): Promise<void> {
    await this.respondTo((format) => {
      (format.html() as Variants).phone(() => this.render({ body: "phone" }));
      (format.html() as Variants).any(() => this.render({ body: "any" }));
    });
  }

  async variantAnyWithNone(): Promise<void> {
    await this.respondTo((format) => {
      (format.html() as Variants).any(":none", ":phone", () =>
        this.render({ body: "none or phone" }),
      );
    });
  }

  async formatAnyVariantAny(): Promise<void> {
    await this.respondTo((format) => {
      format.html(() => this.render({ body: "HTML" }));
      format.any("js", "xml", (variant: VariantCollector) => {
        (variant as Variants).phone(() => this.render({ body: "phone" }));
        variant.any(":tablet", ":phablet", () => this.render({ body: "tablet" }));
      });
    });
  }
}
RespondToController.beforeAction((c) => {
  const controller = c as RespondToController;
  const v = controller.params.get("v");
  if (typeof v === "string") controller.request.variant = `:${v}`;
  else if (Array.isArray(v)) controller.request.variant = v.map((x) => `:${x}`);
});

async function get(action: string, v: string): Promise<RespondToController> {
  const controller = new RespondToController();
  const request = new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/",
    HTTP_HOST: "localhost",
    QUERY_STRING: `v=${v}`,
  });
  await controller.dispatch(action, request, new Response());
  return controller;
}

beforeAll(() => {
  RespondToController.prependViewPath(
    new FixtureResolver({
      "respond_to/variantWithImplicitTemplateRendering.html+mobile.tse": "mobile",
      "respond_to/variantPlusNoneForFormat.html.tse": "none",
    }),
  );
  RespondToController.layout(false);
});

describe("RespondToControllerTest", () => {
  it("variant with implicit template rendering", async () => {
    const controller = await get("variantWithImplicitTemplateRendering", "mobile");
    expect(controller.response.mediaType).toBe("text/html");
    expect(controller.responseBody).toBe("mobile");
  });

  it("variant without implicit rendering from browser", async () => {
    await expect(get("variantWithoutImplicitTemplateRendering", "does_not_matter")).rejects.toThrow(
      MissingExactTemplate,
    );
  });

  let tc: TestCase;

  beforeEach(() => {
    tc = new TestCase(RespondToController);
  });

  it("variant with format and custom render", async () => {
    await tc.get("variantWithFormatAndCustomRender", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("mobile");
  });

  it("multiple variants for format", async () => {
    await tc.get("multipleVariantsForFormat", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("tablet");
  });

  it("no variant in variant setup", async () => {
    await tc.get("variantPlusNoneForFormat");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("none");
  });

  it("variant inline syntax", async () => {
    await tc.get("variantInlineSyntax");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("none");

    await tc.get("variantInlineSyntax", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("phone");
  });

  it("variant inline syntax with format", async () => {
    await tc.get("variantInlineSyntax", { format: "js" });
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.responseBody).toBe("js");
  });

  it("variant any", async () => {
    await tc.get("variantAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("phone");

    await tc.get("variantAny", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");

    await tc.get("variantAny", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");
  });

  it("variant any any", async () => {
    await tc.get("variantAnyAny");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");

    await tc.get("variantAnyAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("phone");

    await tc.get("variantAnyAny", { params: { v: "yolo" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");
  });

  it("variant inline any", async () => {
    await tc.get("variantAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("phone");

    await tc.get("variantInlineAny", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");

    await tc.get("variantInlineAny", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");
  });

  it("variant inline any any", async () => {
    await tc.get("variantInlineAnyAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("phone");

    await tc.get("variantInlineAnyAny", { params: { v: "yolo" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("any");
  });

  it("variant any with none", async () => {
    await tc.get("variantAnyWithNone");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("none or phone");

    await tc.get("variantAnyWithNone", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.responseBody).toBe("none or phone");
  });

  it("format any variant any", async () => {
    await tc.get("formatAnyVariantAny", { format: "js", params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.responseBody).toBe("tablet");
  });

  it("html", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html content");
        format.xml(() => "xml content");
      },
      { accept: "text/html" },
    );
    expect(result).toBe("html content");
  });

  it("all", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.xml(() => "xml");
      },
      { accept: "*/*" },
    );
    expect(result).toBe("html");
  });

  it("xml", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.xml(() => "xml");
      },
      { accept: "application/xml" },
    );
    expect(result).toBe("xml");
  });

  it("js or html", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.js(() => "js");
      },
      { accept: "text/javascript" },
    );
    expect(result).toBe("js");
  });

  it("json or yaml", () => {
    const result = respondTo(
      (format) => {
        format.json(() => "json");
        format.yaml(() => "yaml");
      },
      { accept: "application/json" },
    );
    expect(result).toBe("json");
  });

  it("json or yaml with leading star star", () => {
    const result = respondTo(
      (format) => {
        format.json(() => "json");
        format.yaml(() => "yaml");
      },
      { accept: "*/*" },
    );
    expect(result).toBe("json");
  });

  it("using defaults", () => {
    const result = respondTo((format) => {
      format.html(() => "html");
      format.json(() => "json");
    }, {});
    expect(result).toBe("html");
  });

  it("with atom content type", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.atom(() => "atom");
      },
      { accept: "application/atom+xml" },
    );
    expect(result).toBe("atom");
  });

  it("with rss content type", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.rss(() => "rss");
      },
      { accept: "application/rss+xml" },
    );
    expect(result).toBe("rss");
  });

  it("handle any", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.any(() => "any");
      },
      { accept: "application/json" },
    );
    expect(result).toBe("any");
  });

  it("handle any any", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { accept: "*/*" },
    );
    expect(result).toBe("any");
  });

  it("handle any any parameter format", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { format: "json" },
    );
    expect(result).toBe("any");
  });

  it("handle any any explicit html", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { format: "html" },
    );
    expect(result).toBe("any");
  });

  it("handle any any javascript", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { accept: "text/javascript" },
    );
    expect(result).toBe("any");
  });

  it("handle any any xml", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "any");
      },
      { accept: "application/xml" },
    );
    expect(result).toBe("any");
  });

  it("forced format", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      { format: "json" },
    );
    expect(result).toBe("json");
  });

  it("explicit format overrides accept header", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      { format: "json", accept: "text/html" },
    );
    expect(result).toBe("json");
  });

  it("invalid format", () => {
    expect(() =>
      respondTo(
        (format) => {
          format.html(() => "html");
        },
        { format: "json" },
      ),
    ).toThrow(UnknownFormat);
  });

  it("custom constant", () => {
    const result = respondTo(
      (format) => {
        format.on("custom", () => "custom");
      },
      { format: "custom" },
    );
    expect(result).toBe("custom");
  });

  it("custom constant handling without block", () => {
    const result = respondTo(
      (format) => {
        format.on("custom");
      },
      { format: "custom" },
    );
    expect(result).toBeUndefined();
  });

  it("js or anything", () => {
    const result = respondTo(
      (format) => {
        format.js(() => "js");
        format.any(() => "any");
      },
      { accept: "text/html" },
    );
    expect(result).toBe("any");
  });

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
      { format: "text" },
    );
    expect(result).toBe("plain text");
  });

  it("csv format", () => {
    const result = respondTo(
      (format) => {
        format.csv(() => "a,b,c");
      },
      { format: "csv" },
    );
    expect(result).toBe("a,b,c");
  });

  it("pdf format", () => {
    const result = respondTo(
      (format) => {
        format.pdf(() => "pdf-data");
      },
      { format: "pdf" },
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
      { accept: "application/xml, text/html;q=0.9, application/json;q=0.8" },
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
      { format: "html" },
    );
    expect(result).toBeUndefined();
  });

  it("using defaults with type list", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.js(() => "js");
      },
      { accept: "text/javascript, text/html" },
    );
    expect(result).toBe("js");
  });

  it("synonyms", () => {
    const result = respondTo(
      (format) => {
        format.xml(() => "xml content");
      },
      { accept: "text/xml" },
    );
    expect(result).toBe("xml content");
  });

  it("xhtml alias", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html content");
      },
      { accept: "application/xhtml+xml" },
    );
    expect(result).toBe("html content");
  });

  it("using conflicting nested js then html", () => {
    const result = respondTo(
      (format) => {
        format.js(() => "js");
        format.html(() => "html");
      },
      { accept: "text/html" },
    );
    expect(result).toBe("html");
  });

  it("using non conflicting nested js then js", () => {
    const result = respondTo(
      (format) => {
        format.js(() => "js1");
      },
      { accept: "text/javascript" },
    );
    expect(result).toBe("js1");
  });

  it("handle any any unknown format", () => {
    const result = respondTo(
      (format) => {
        format.any(() => "fallback");
      },
      { format: "unknown_format" },
    );
    expect(result).toBe("fallback");
  });

  it("extension synonyms", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
      },
      { accept: "text/html" },
    );
    expect(result).toBe("html");
  });

  it("firefox simulation", () => {
    const result = respondTo(
      (format) => {
        format.html(() => "html");
        format.json(() => "json");
      },
      {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    );
    expect(result).toBe("html");
  });
});
