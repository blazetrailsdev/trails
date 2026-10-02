import "../../../test-helpers/abstract-unit.js";
import { afterEach, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { DetailsKey } from "@blazetrails/actionview";
import { MimeType } from "../../../action-dispatch/http/mime-type.js";
import { Request } from "../../../action-dispatch/http/request.js";
import { Response } from "../../../action-dispatch/http/response.js";
import { Base } from "../../base.js";
import {
  MissingExactTemplate,
  RespondToMismatchError,
  UnknownFormat,
} from "../../metal/exceptions.js";
import type { VariantCollector } from "../../metal/mime-responds.js";
import { TestCase } from "../../test-case.js";

type Variants = VariantCollector & Record<string, (block?: () => unknown) => void>;

class RespondToController extends Base {
  async htmlXmlOrRss(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.xml(() => this.render({ body: "XML" }));
      type.rss(() => this.render({ body: "RSS" }));
      type.all(() => this.render({ body: "Nothing" }));
    });
  }

  async jsOrHtml(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.js(() => this.render({ body: "JS" }));
      type.all(() => this.render({ body: "Nothing" }));
    });
  }

  async jsonOrYaml(): Promise<void> {
    await this.respondTo((type) => {
      type.json(() => this.render({ body: "JSON" }));
      type.yaml(() => this.render({ body: "YAML" }));
    });
  }

  async htmlOrXml(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.xml(() => this.render({ body: "XML" }));
      type.all(() => this.render({ body: "Nothing" }));
    });
  }

  async jsonXmlOrHtml(): Promise<void> {
    await this.respondTo((type) => {
      type.json(() => this.render({ body: "JSON" }));
      type.xml(() => this.render({ xml: "XML" }));
      type.html(() => this.render({ body: "HTML" }));
    });
  }

  async justXml(): Promise<void> {
    await this.respondTo((type) => {
      type.xml(() => this.render({ body: "XML" }));
    });
  }

  async usingDefaults(): Promise<void> {
    await this.respondTo((type) => {
      type.html();
      type.xml();
    });
  }

  async usingDefaultsWithTypeList(): Promise<void> {
    await this.respondTo("html", "xml");
  }

  async madeForContentType(): Promise<void> {
    await this.respondTo((type) => {
      type.rss(() => this.render({ body: "RSS" }));
      type.atom(() => this.render({ body: "ATOM" }));
      type.all(() => this.render({ body: "Nothing" }));
    });
  }

  async usingConflictingNestedJsThenHtml(): Promise<void> {
    await this.respondTo((outerType) => {
      outerType.js(() =>
        this.respondTo((innerType) => {
          innerType.html(() => this.render({ body: "HTML" }));
        }),
      );
    });
  }

  async usingNonConflictingNestedJsThenJs(): Promise<void> {
    await this.respondTo((outerType) => {
      outerType.js(() =>
        this.respondTo((innerType) => {
          innerType.js(() => this.render({ body: "JS" }));
        }),
      );
    });
  }

  async customConstantHandling(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.mobile(() => this.render({ body: "Mobile" }));
    });
  }

  async customConstantHandlingWithoutBlock(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.mobile();
    });
  }

  async handleAny(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.any("js", "xml", () => this.render({ body: "Either JS or XML" }));
    });
  }

  async handleAnyAny(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.any(() => this.render({ body: "Whatever you ask for, I got it" }));
    });
  }

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

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new RespondToController();
    await tc.beforeSetup();
    MimeType.register("text/x-mobile", ":mobile");
    MimeType.register("application/fancy-xml", ":fancy_xml");
    MimeType.register("text/html; fragment", ":html_fragment");
    DetailsKey.clear();
  });

  afterEach(() => {
    MimeType.unregister(":mobile");
    MimeType.unregister(":fancy_xml");
    MimeType.unregister(":html_fragment");
    DetailsKey.clear();
  });

  it("variant with format and custom render", async () => {
    await tc.get("variantWithFormatAndCustomRender", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("mobile");
  });

  it("multiple variants for format", async () => {
    await tc.get("multipleVariantsForFormat", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("tablet");
  });

  it("no variant in variant setup", async () => {
    await tc.get("variantPlusNoneForFormat");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none");
  });

  it("variant inline syntax", async () => {
    await tc.get("variantInlineSyntax");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none");

    await tc.get("variantInlineSyntax", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");
  });

  it("variant inline syntax with format", async () => {
    await tc.get("variantInlineSyntax", { format: "js" });
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.response.body).toBe("js");
  });

  it("variant any", async () => {
    await tc.get("variantAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variantAny", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");

    await tc.get("variantAny", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant any any", async () => {
    await tc.get("variantAnyAny");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");

    await tc.get("variantAnyAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variantAnyAny", { params: { v: "yolo" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant inline any", async () => {
    await tc.get("variantAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variantInlineAny", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");

    await tc.get("variantInlineAny", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant inline any any", async () => {
    await tc.get("variantInlineAnyAny", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variantInlineAnyAny", { params: { v: "yolo" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant any with none", async () => {
    await tc.get("variantAnyWithNone");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none or phone");

    await tc.get("variantAnyWithNone", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none or phone");
  });

  it("format any variant any", async () => {
    await tc.get("formatAnyVariantAny", { format: "js", params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.response.body).toBe("tablet");
  });

  it("custom constant", async () => {
    await tc.get("customConstantHandling", { params: { format: "mobile" } });
    expect(tc.response.mediaType).toBe("text/x-mobile");
    expect(tc.response.body).toBe("Mobile");
  });

  it("custom constant handling without block", async () => {
    await tc.get("customConstantHandlingWithoutBlock", { params: { format: "mobile" } });
    expect(tc.response.mediaType).toBe("text/x-mobile");
    expect(tc.response.body).toBe("Mobile");
  });

  it("html", async () => {
    tc.request.accept = "text/html";
    await tc.get("jsOrHtml");
    expect(tc.response.body).toBe("HTML");

    await tc.get("htmlOrXml");
    expect(tc.response.body).toBe("HTML");

    await expect(tc.get("justXml")).rejects.toThrow(UnknownFormat);
  });

  it("all", async () => {
    tc.request.accept = "*/*";
    await tc.get("jsOrHtml");
    expect(tc.response.body).toBe("HTML");

    await tc.get("htmlOrXml");
    expect(tc.response.body).toBe("HTML");

    await tc.get("justXml");
    expect(tc.response.body).toBe("XML");
  });

  it("xml", async () => {
    tc.request.accept = "application/xml";
    await tc.get("htmlXmlOrRss");
    expect(tc.response.body).toBe("XML");
  });

  it("js or html", async () => {
    tc.request.accept = "text/javascript, text/html";
    await tc.get("jsOrHtml", { xhr: true });
    expect(tc.response.body).toBe("JS");

    tc.request.accept = "text/javascript, text/html";
    await tc.get("htmlOrXml", { xhr: true });
    expect(tc.response.body).toBe("HTML");

    tc.request.accept = "text/javascript, text/html";

    await expect(tc.get("justXml", { xhr: true })).rejects.toThrow(UnknownFormat);
  });

  it("json or yaml with leading star star", async () => {
    tc.request.accept = "*/*, application/json";
    await tc.get("jsonXmlOrHtml");
    expect(tc.response.body).toBe("HTML");

    tc.request.accept = "*/* , application/json";
    await tc.get("jsonXmlOrHtml");
    expect(tc.response.body).toBe("HTML");
  });

  it("json or yaml", async () => {
    await tc.get("jsonOrYaml", { xhr: true });
    expect(tc.response.body).toBe("JSON");

    await tc.get("jsonOrYaml", { params: { format: "json" } });
    expect(tc.response.body).toBe("JSON");

    await tc.get("jsonOrYaml", { params: { format: "yaml" } });
    expect(tc.response.body).toBe("YAML");

    for (const [body, contentTypes] of [
      ["YAML", ["text/yaml"]],
      ["JSON", ["application/json", "text/x-json"]],
    ] as const) {
      for (const contentType of contentTypes) {
        tc.request.accept = contentType;
        await tc.get("jsonOrYaml");
        expect(tc.response.body).toBe(body);
      }
    }
  });

  it("js or anything", async () => {
    tc.request.accept = "text/javascript, */*";
    await tc.get("jsOrHtml", { xhr: true });
    expect(tc.response.body).toBe("JS");

    await tc.get("htmlOrXml", { xhr: true });
    expect(tc.response.body).toBe("HTML");

    await tc.get("justXml", { xhr: true });
    expect(tc.response.body).toBe("XML");
  });

  it("using defaults", async () => {
    tc.request.accept = "*/*";
    await tc.get("usingDefaults");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("Hello world!");

    tc.request.accept = "application/xml";
    await tc.get("usingDefaults");
    expect(tc.response.mediaType).toBe("application/xml");
    expect(tc.response.body).toBe("<p>Hello world!</p>\n");
  });

  it("using defaults with type list", async () => {
    tc.request.accept = "*/*";
    await tc.get("usingDefaultsWithTypeList");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("Hello world!");

    tc.request.accept = "application/xml";
    await tc.get("usingDefaultsWithTypeList");
    expect(tc.response.mediaType).toBe("application/xml");
    expect(tc.response.body).toBe("<p>Hello world!</p>\n");
  });

  it("using conflicting nested js then html", async () => {
    tc.request.accept = "*/*";
    await expect(tc.get("usingConflictingNestedJsThenHtml")).rejects.toThrow(
      RespondToMismatchError,
    );
  });

  it("using non conflicting nested js then js", async () => {
    tc.request.accept = "*/*";
    await tc.get("usingNonConflictingNestedJsThenJs");
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.response.body).toBe("JS");
  });

  it("with atom content type", async () => {
    tc.request.accept = "";
    tc.request.env["CONTENT_TYPE"] = "application/atom+xml";
    await tc.get("madeForContentType", { xhr: true });
    expect(tc.response.body).toBe("ATOM");
  });

  it("with rss content type", async () => {
    tc.request.accept = "";
    tc.request.env["CONTENT_TYPE"] = "application/rss+xml";
    await tc.get("madeForContentType", { xhr: true });
    expect(tc.response.body).toBe("RSS");
  });

  it("synonyms", async () => {
    tc.request.accept = "application/javascript";
    await tc.get("jsOrHtml");
    expect(tc.response.body).toBe("JS");

    tc.request.accept = "application/x-xml";
    await tc.get("htmlXmlOrRss");
    expect(tc.response.body).toBe("XML");
  });

  it("xhtml alias", async () => {
    tc.request.accept = "application/xhtml+xml,application/xml";
    await tc.get("htmlOrXml");
    expect(tc.response.body).toBe("HTML");
  });

  it("firefox simulation", async () => {
    tc.request.accept =
      "text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5";
    await tc.get("htmlOrXml");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any", async () => {
    tc.request.accept = "*/*";
    await tc.get("handleAny");
    expect(tc.response.body).toBe("HTML");

    tc.request.accept = "text/javascript";
    await tc.get("handleAny");
    expect(tc.response.body).toBe("Either JS or XML");

    tc.request.accept = "text/xml";
    await tc.get("handleAny");
    expect(tc.response.body).toBe("Either JS or XML");
  });

  it("handle any any", async () => {
    tc.request.accept = "*/*";
    await tc.get("handleAnyAny");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any any parameter format", async () => {
    await tc.get("handleAnyAny", { params: { format: "html" } });
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any any explicit html", async () => {
    tc.request.accept = "text/html";
    await tc.get("handleAnyAny");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any any javascript", async () => {
    tc.request.accept = "text/javascript";
    await tc.get("handleAnyAny");
    expect(tc.response.body).toBe("Whatever you ask for, I got it");
  });

  it("handle any any xml", async () => {
    tc.request.accept = "text/xml";
    await tc.get("handleAnyAny");
    expect(tc.response.body).toBe("Whatever you ask for, I got it");
  });

  it("handle any any unknown format", async () => {
    await tc.get("handleAnyAny", { params: { format: "php" } });
    expect(tc.response.body).toBe("Whatever you ask for, I got it");
  });

  it("forced format", async () => {
    await tc.get("htmlXmlOrRss");
    expect(tc.response.body).toBe("HTML");

    await tc.get("htmlXmlOrRss", { params: { format: "html" } });
    expect(tc.response.body).toBe("HTML");

    await tc.get("htmlXmlOrRss", { params: { format: "xml" } });
    expect(tc.response.body).toBe("XML");

    await tc.get("htmlXmlOrRss", { params: { format: "rss" } });
    expect(tc.response.body).toBe("RSS");
  });

  it("extension synonyms", async () => {
    await tc.get("htmlXmlOrRss", { params: { format: "xhtml" } });
    expect(tc.response.body).toBe("HTML");
  });

  it("invalid format", async () => {
    await expect(tc.get("usingDefaults", { params: { format: "invalidformat" } })).rejects.toThrow(
      UnknownFormat,
    );
  });
});
