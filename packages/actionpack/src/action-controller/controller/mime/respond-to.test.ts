import "../../../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { DetailsKey } from "@blazetrails/actionview";
import { MimeType } from "../../../action-dispatch/http/mime-type.js";
import { Base } from "../../base.js";
import {
  MissingExactTemplate,
  RespondToMismatchError,
  UnknownFormat,
} from "../../metal/exceptions.js";
import type { VariantCollector } from "../../metal/mime-responds.js";
import { Logger } from "@blazetrails/activesupport";
import { rbInspect } from "@blazetrails/ruby-compat";
import { TestCase } from "../../test-case.js";

type Variants = VariantCollector & Record<string, (block?: () => unknown) => void>;

class RespondToController extends Base {
  declare type: string;
  declare action: string | undefined;

  async myHtmlFragment(): Promise<void> {
    await this.respondTo((type) => {
      type.htmlFragment(() => this.render({ body: "neat" }));
    });
  }

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

  async forcedXml(): Promise<void> {
    this.request.setFormat("xml");

    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.xml(() => this.render({ body: "XML" }));
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

  async missingTemplates(): Promise<void> {
    await this.respondTo((type) => {
      type.json(() => {});
      type.xml();
    });
  }

  async usingDefaultsWithTypeList(): Promise<void> {
    await this.respondTo("html", "xml");
  }

  async usingDefaultsWithAll(): Promise<void> {
    await this.respondTo((type) => {
      type.html();
      type.all(() => this.render({ body: "ALL" }));
    });
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

  async customTypeHandling(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.custom("application/fancy-xml", () => this.render({ body: "Fancy XML" }));
      type.all(() => this.render({ body: "Nothing" }));
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

  async handleAnyDoesntSetRequestContentType(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.any(() => this.render({ json: { foo: "bar" } }));
    });
  }

  async handleAnyAny(): Promise<void> {
    await this.respondTo((type) => {
      type.html(() => this.render({ body: "HTML" }));
      type.any(() => this.render({ body: "Whatever you ask for, I got it" }));
    });
  }

  async handleAnyWithTemplate(): Promise<void> {
    await this.respondTo((type) => {
      type.any(() => this.render("test/hello_world"));
    });
  }

  async allTypesWithLayout(): Promise<void> {
    await this.respondTo((type) => {
      type.html();
    });
  }

  async jsonWithCallback(): Promise<void> {
    await this.respondTo((type) => {
      type.json(() => this.render({ json: "JS", callback: "alert" }));
    });
  }

  async iphoneWithHtmlResponseType(): Promise<void> {
    if (this.request.env["HTTP_ACCEPT"] === "text/iphone") this.request.setFormat("iphone");

    await this.respondTo((type) => {
      type.html(() => {
        this.type = "Firefox";
      });
      type.iphone(() => {
        this.type = "iPhone";
      });
    });
  }

  async iphoneWithHtmlResponseTypeWithoutLayout(): Promise<void> {
    if (this.request.env["HTTP_ACCEPT"] === "text/iphone") this.request.setFormat("iphone");

    await this.respondTo((type) => {
      type.html(() => {
        this.type = "Firefox";
        return this.render({ action: "iphone_with_html_response_type" });
      });
      type.iphone(() => {
        this.type = "iPhone";
        return this.render({ action: "iphone_with_html_response_type" });
      });
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

  async variantInlineSyntaxWithoutBlock(): Promise<void> {
    await this.respondTo((format) => {
      format.js();
      (format.html() as Variants).none();
      (format.html() as Variants).phone();
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

  async variantAnyImplicitRender(): Promise<void> {
    await this.respondTo((format) => {
      (format.html() as Variants).phone();
      (format.html() as Variants).any(":tablet", ":phablet");
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

  private setLayout(): string | undefined {
    switch (this.actionName) {
      case "all_types_with_layout":
      case "iphone_with_html_response_type":
        return "respond_to/layouts/standard";
      case "iphone_with_html_response_type_without_layout":
        return "respond_to/layouts/missing";
    }
  }
}
RespondToController.beforeAction((c) => {
  const controller = c as RespondToController;
  const v = controller.params.get("v");
  if (typeof v === "string") controller.request.variant = `:${v}`;
  else if (Array.isArray(v)) controller.request.variant = v.map((x) => `:${x}`);
});

class MockLogger extends Logger {
  private _logged: string[] = [];

  constructor() {
    super(null);
  }

  logged(level: string): string[] {
    return level === "info" ? this._logged : [];
  }

  override info(message?: string | (() => string)): boolean {
    this._logged.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }
}

RespondToController.layout(":setLayout");

const NO_CONTENT_WARNING =
  "No template found for RespondToController#variant_without_implicit_template_rendering, rendering head :no_content";

describe("RespondToControllerTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new RespondToController();
    await tc.beforeSetup();
    tc.request.host = "www.example.com";
    MimeType.registerAlias("text/html", ":iphone");
    MimeType.register("text/x-mobile", ":mobile");
    MimeType.register("application/fancy-xml", ":fancy_xml");
    MimeType.register("text/html; fragment", ":html_fragment");
    DetailsKey.clear();
  });

  afterEach(() => {
    MimeType.unregister(":iphone");
    MimeType.unregister(":mobile");
    MimeType.unregister(":fancy_xml");
    MimeType.unregister(":html_fragment");
    DetailsKey.clear();
  });

  it("html fragment", async () => {
    tc.request.accept = "text/html; fragment";
    await tc.get("my_html_fragment");
    expect(tc.response.headers.get("Content-Type")).toBe("text/html; fragment; charset=utf-8");
    expect(tc.response.body).toBe("neat");
  });

  it("html", async () => {
    tc.request.accept = "text/html";
    await tc.get("js_or_html");
    expect(tc.response.body).toBe("HTML");

    await tc.get("html_or_xml");
    expect(tc.response.body).toBe("HTML");

    await expect(tc.get("just_xml")).rejects.toThrow(UnknownFormat);
  });

  it("all", async () => {
    tc.request.accept = "*/*";
    await tc.get("js_or_html");
    expect(tc.response.body).toBe("HTML");

    await tc.get("html_or_xml");
    expect(tc.response.body).toBe("HTML");

    await tc.get("just_xml");
    expect(tc.response.body).toBe("XML");
  });

  it("xml", async () => {
    tc.request.accept = "application/xml";
    await tc.get("html_xml_or_rss");
    expect(tc.response.body).toBe("XML");
  });

  it("js or html", async () => {
    tc.request.accept = "text/javascript, text/html";
    await tc.get("js_or_html", { xhr: true });
    expect(tc.response.body).toBe("JS");

    tc.request.accept = "text/javascript, text/html";
    await tc.get("html_or_xml", { xhr: true });
    expect(tc.response.body).toBe("HTML");

    tc.request.accept = "text/javascript, text/html";

    await expect(tc.get("just_xml", { xhr: true })).rejects.toThrow(UnknownFormat);
  });

  it("json or yaml with leading star star", async () => {
    tc.request.accept = "*/*, application/json";
    await tc.get("json_xml_or_html");
    expect(tc.response.body).toBe("HTML");

    tc.request.accept = "*/* , application/json";
    await tc.get("json_xml_or_html");
    expect(tc.response.body).toBe("HTML");
  });

  it("json or yaml", async () => {
    await tc.get("json_or_yaml", { xhr: true });
    expect(tc.response.body).toBe("JSON");

    await tc.get("json_or_yaml", { params: { format: "json" } });
    expect(tc.response.body).toBe("JSON");

    await tc.get("json_or_yaml", { params: { format: "yaml" } });
    expect(tc.response.body).toBe("YAML");

    for (const [body, contentTypes] of [
      ["YAML", ["text/yaml"]],
      ["JSON", ["application/json", "text/x-json"]],
    ] as const) {
      for (const contentType of contentTypes) {
        tc.request.accept = contentType;
        await tc.get("json_or_yaml");
        expect(tc.response.body).toBe(body);
      }
    }
  });

  it("js or anything", async () => {
    tc.request.accept = "text/javascript, */*";
    await tc.get("js_or_html", { xhr: true });
    expect(tc.response.body).toBe("JS");

    await tc.get("html_or_xml", { xhr: true });
    expect(tc.response.body).toBe("HTML");

    await tc.get("just_xml", { xhr: true });
    expect(tc.response.body).toBe("XML");
  });

  it("using defaults", async () => {
    tc.request.accept = "*/*";
    await tc.get("using_defaults");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("Hello world!");

    tc.request.accept = "application/xml";
    await tc.get("using_defaults");
    expect(tc.response.mediaType).toBe("application/xml");
    expect(tc.response.body).toBe("<p>Hello world!</p>\n");
  });

  it("using defaults with all", async () => {
    tc.request.accept = "*/*";
    await tc.get("using_defaults_with_all");
    expect(tc.response.body.trim()).toBe("HTML!");

    tc.request.accept = "text/html";
    await tc.get("using_defaults_with_all");
    expect(tc.response.body.trim()).toBe("HTML!");

    tc.request.accept = "application/json";
    await tc.get("using_defaults_with_all");
    expect(tc.response.body).toBe("ALL");
  });

  it("using defaults with type list", async () => {
    tc.request.accept = "*/*";
    await tc.get("using_defaults_with_type_list");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("Hello world!");

    tc.request.accept = "application/xml";
    await tc.get("using_defaults_with_type_list");
    expect(tc.response.mediaType).toBe("application/xml");
    expect(tc.response.body).toBe("<p>Hello world!</p>\n");
  });

  it("using conflicting nested js then html", async () => {
    tc.request.accept = "*/*";
    await expect(tc.get("using_conflicting_nested_js_then_html")).rejects.toThrow(
      RespondToMismatchError,
    );
  });

  it("using non conflicting nested js then js", async () => {
    tc.request.accept = "*/*";
    await tc.get("using_non_conflicting_nested_js_then_js");
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.response.body).toBe("JS");
  });

  it("with atom content type", async () => {
    tc.request.accept = "";
    tc.request.env["CONTENT_TYPE"] = "application/atom+xml";
    await tc.get("made_for_content_type", { xhr: true });
    expect(tc.response.body).toBe("ATOM");
  });

  it("with rss content type", async () => {
    tc.request.accept = "";
    tc.request.env["CONTENT_TYPE"] = "application/rss+xml";
    await tc.get("made_for_content_type", { xhr: true });
    expect(tc.response.body).toBe("RSS");
  });

  it("synonyms", async () => {
    tc.request.accept = "application/javascript";
    await tc.get("js_or_html");
    expect(tc.response.body).toBe("JS");

    tc.request.accept = "application/x-xml";
    await tc.get("html_xml_or_rss");
    expect(tc.response.body).toBe("XML");
  });

  it("custom types", async () => {
    tc.request.accept = "application/fancy-xml";
    await tc.get("custom_type_handling");
    expect(tc.response.mediaType).toBe("application/fancy-xml");
    expect(tc.response.body).toBe("Fancy XML");

    tc.request.accept = "text/html";
    await tc.get("custom_type_handling");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("HTML");
  });

  it("xhtml alias", async () => {
    tc.request.accept = "application/xhtml+xml,application/xml";
    await tc.get("html_or_xml");
    expect(tc.response.body).toBe("HTML");
  });

  it("firefox simulation", async () => {
    tc.request.accept =
      "text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5";
    await tc.get("html_or_xml");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any", async () => {
    tc.request.accept = "*/*";
    await tc.get("handle_any");
    expect(tc.response.body).toBe("HTML");

    tc.request.accept = "text/javascript";
    await tc.get("handle_any");
    expect(tc.response.body).toBe("Either JS or XML");

    tc.request.accept = "text/xml";
    await tc.get("handle_any");
    expect(tc.response.body).toBe("Either JS or XML");
  });

  it("handle any doesnt set request content type", async () => {
    tc.request.accept = "text/csv";
    await tc.get("handle_any_doesnt_set_request_content_type");
    expect(tc.response.mediaType).toBe("application/json");
  });

  it("handle any any", async () => {
    tc.request.accept = "*/*";
    await tc.get("handle_any_any");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any any parameter format", async () => {
    await tc.get("handle_any_any", { params: { format: "html" } });
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any any explicit html", async () => {
    tc.request.accept = "text/html";
    await tc.get("handle_any_any");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any any javascript", async () => {
    tc.request.accept = "text/javascript";
    await tc.get("handle_any_any");
    expect(tc.response.body).toBe("Whatever you ask for, I got it");
  });

  it("handle any any xml", async () => {
    tc.request.accept = "text/xml";
    await tc.get("handle_any_any");
    expect(tc.response.body).toBe("Whatever you ask for, I got it");
  });

  it("handle any any unknown format", async () => {
    await tc.get("handle_any_any", { params: { format: "php" } });
    expect(tc.response.body).toBe("Whatever you ask for, I got it");
  });

  it("browser check with any any", async () => {
    tc.request.accept = "application/json, application/xml";
    await tc.get("json_xml_or_html");
    expect(tc.response.body).toBe("JSON");

    tc.request.accept = "application/json, application/xml, */*";
    await tc.get("json_xml_or_html");
    expect(tc.response.body).toBe("HTML");
  });

  it("handle any with template", async () => {
    tc.request.accept = "*/*";

    await tc.get("handle_any_with_template");
    expect(tc.response.body).toBe("Hello world!");
  });

  it("html type with layout", async () => {
    tc.request.accept = "text/html";
    await tc.get("all_types_with_layout");
    expect(tc.response.body).toBe(
      '<html><div id="html">HTML for all_types_with_layout</div></html>',
    );
  });

  it("json with callback sets javascript content type", async () => {
    tc.request.accept = "application/json";
    await tc.get("json_with_callback");
    expect(tc.response.body).toBe("/**/alert(JS)");
    expect(tc.response.mediaType).toBe("text/javascript");
  });

  it("xhr", async () => {
    await tc.get("js_or_html", { xhr: true });
    expect(tc.response.body).toBe("JS");
  });

  it("custom constant", async () => {
    await tc.get("custom_constant_handling", { params: { format: "mobile" } });
    expect(tc.response.mediaType).toBe("text/x-mobile");
    expect(tc.response.body).toBe("Mobile");
  });

  it("custom constant handling without block", async () => {
    await tc.get("custom_constant_handling_without_block", { params: { format: "mobile" } });
    expect(tc.response.mediaType).toBe("text/x-mobile");
    expect(tc.response.body).toBe("Mobile");
  });

  it("forced format", async () => {
    await tc.get("html_xml_or_rss");
    expect(tc.response.body).toBe("HTML");

    await tc.get("html_xml_or_rss", { params: { format: "html" } });
    expect(tc.response.body).toBe("HTML");

    await tc.get("html_xml_or_rss", { params: { format: "xml" } });
    expect(tc.response.body).toBe("XML");

    await tc.get("html_xml_or_rss", { params: { format: "rss" } });
    expect(tc.response.body).toBe("RSS");
  });

  it("internally forced format", async () => {
    await tc.get("forced_xml");
    expect(tc.response.body).toBe("XML");

    await tc.get("forced_xml", { format: "html" });
    expect(tc.response.body).toBe("XML");
  });

  it("extension synonyms", async () => {
    await tc.get("html_xml_or_rss", { params: { format: "xhtml" } });
    expect(tc.response.body).toBe("HTML");
  });

  it("render action for html", async () => {
    const controller = tc.controller as RespondToController;
    controller.render = async function (this: RespondToController, ...args: unknown[]) {
      if (args.length > 0) this.action = (args[0] as { action?: string }).action;
      this.action ??= this.actionName;

      this.response.body = `${this.action} - ${rbInspect(this.formats)}`;
    };

    await tc.get("using_defaults");
    expect(tc.response.body).toBe(`using_defaults - ${rbInspect([":html"])}`);

    await tc.get("using_defaults", { format: "xml" });
    expect(tc.response.body).toBe(`using_defaults - ${rbInspect([":xml"])}`);
  });

  it("format with custom response type", async () => {
    await tc.get("iphone_with_html_response_type");
    expect(tc.response.body).toBe('<html><div id="html">Hello future from Firefox!</div></html>');

    await tc.get("iphone_with_html_response_type", { format: "iphone" });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe(
      '<html><div id="iphone">Hello iPhone future from iPhone!</div></html>',
    );
  });

  it("format with custom response type and request headers", async () => {
    tc.request.accept = "text/iphone";
    await tc.get("iphone_with_html_response_type");
    expect(tc.response.body).toBe(
      '<html><div id="iphone">Hello iPhone future from iPhone!</div></html>',
    );
    expect(tc.response.mediaType).toBe("text/html");
  });

  it("invalid format", async () => {
    await expect(tc.get("using_defaults", { params: { format: "invalidformat" } })).rejects.toThrow(
      UnknownFormat,
    );
  });

  it("missing templates", async () => {
    await tc.get("missing_templates", { format: "json" });
    tc.assertResponse("no_content");
    await tc.get("missing_templates", { format: "xml" });
    tc.assertResponse("no_content");
  });

  it("invalid variant", async () => {
    await expect(
      tc.get("variant_with_implicit_template_rendering", { params: { v: "invalid" } }),
    ).rejects.toThrow(UnknownFormat);
  });

  it("variant not set regular unknown format", async () => {
    await expect(tc.get("variant_with_implicit_template_rendering")).rejects.toThrow(UnknownFormat);
  });

  it("variant with implicit template rendering", async () => {
    await tc.get("variant_with_implicit_template_rendering", { params: { v: "mobile" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("mobile");
  });

  it("variant without implicit rendering from browser", async () => {
    await expect(
      tc.get("variant_without_implicit_template_rendering", { params: { v: "does_not_matter" } }),
    ).rejects.toThrow(MissingExactTemplate);
  });

  it("variant variant not set and without implicit rendering from browser", async () => {
    await expect(tc.get("variant_without_implicit_template_rendering")).rejects.toThrow(
      MissingExactTemplate,
    );
  });

  it("variant without implicit rendering from xhr", async () => {
    const logger = new MockLogger();
    const oldLogger = Base.logger;
    Base.logger = logger;
    try {
      await tc.get("variant_without_implicit_template_rendering", {
        xhr: true,
        params: { v: "does_not_matter" },
      });
      tc.assertResponse("no_content");

      expect(logger.logged("info").filter((s) => s === NO_CONTENT_WARNING).length).toBe(1);
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("variant without implicit rendering from api", async () => {
    const logger = new MockLogger();
    const oldLogger = Base.logger;
    Base.logger = logger;
    try {
      await tc.get("variant_without_implicit_template_rendering", {
        format: "json",
        params: { v: "does_not_matter" },
      });
      tc.assertResponse("no_content");

      expect(logger.logged("info").filter((s) => s === NO_CONTENT_WARNING).length).toBe(1);
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("variant variant not set and without implicit rendering from xhr", async () => {
    const logger = new MockLogger();
    const oldLogger = Base.logger;
    Base.logger = logger;
    try {
      await tc.get("variant_without_implicit_template_rendering", { xhr: true });
      tc.assertResponse("no_content");

      expect(logger.logged("info").filter((s) => s === NO_CONTENT_WARNING).length).toBe(1);
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("variant with format and custom render", async () => {
    await tc.get("variant_with_format_and_custom_render", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("mobile");
  });

  it("multiple variants for format", async () => {
    await tc.get("multiple_variants_for_format", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("tablet");
  });

  it("no variant in variant setup", async () => {
    await tc.get("variant_plus_none_for_format");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none");
  });

  it("variant inline syntax", async () => {
    await tc.get("variant_inline_syntax");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none");

    await tc.get("variant_inline_syntax", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");
  });

  it("variant inline syntax with format", async () => {
    await tc.get("variant_inline_syntax", { format: "js" });
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.response.body).toBe("js");
  });

  it("variant inline syntax without block", async () => {
    await tc.get("variant_inline_syntax_without_block", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");
  });

  it("variant any", async () => {
    await tc.get("variant_any", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variant_any", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");

    await tc.get("variant_any", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant any any", async () => {
    await tc.get("variant_any_any");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");

    await tc.get("variant_any_any", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variant_any_any", { params: { v: "yolo" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant inline any", async () => {
    await tc.get("variant_any", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variant_inline_any", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");

    await tc.get("variant_inline_any", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant inline any any", async () => {
    await tc.get("variant_inline_any_any", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");

    await tc.get("variant_inline_any_any", { params: { v: "yolo" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("any");
  });

  it("variant any implicit render", async () => {
    await tc.get("variant_any_implicit_render", { params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("tablet");

    await tc.get("variant_any_implicit_render", { params: { v: "phablet" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phablet");
  });

  it("variant any with none", async () => {
    await tc.get("variant_any_with_none");
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none or phone");

    await tc.get("variant_any_with_none", { params: { v: "phone" } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("none or phone");
  });

  it("format any variant any", async () => {
    await tc.get("format_any_variant_any", { format: "js", params: { v: "tablet" } });
    expect(tc.response.mediaType).toBe("text/javascript");
    expect(tc.response.body).toBe("tablet");
  });

  it("variant negotiation inline syntax", async () => {
    await tc.get("variant_inline_syntax_without_block", { params: { v: ["tablet", "phone"] } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");
  });

  it("variant negotiation block syntax", async () => {
    await tc.get("variant_plus_none_for_format", { params: { v: ["tablet", "phone"] } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");
  });

  it("variant negotiation without block", async () => {
    await tc.get("variant_inline_syntax_without_block", { params: { v: ["tablet", "phone"] } });
    expect(tc.response.mediaType).toBe("text/html");
    expect(tc.response.body).toBe("phone");
  });
});
