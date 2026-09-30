import { describe, expect, it } from "vitest";

import { FixtureResolver } from "@blazetrails/actionview";
import { Base } from "../base.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Response } from "../../action-dispatch/http/response.js";
import { Collector, VariantCollector } from "./mime-responds.js";
import { RespondToMismatchError, UnknownFormat } from "./exceptions.js";
import { MimeType } from "../../action-dispatch/http/mime-type.js";

type Mimes = Collector & Record<string, (block?: unknown) => unknown>;

function collect(): Mimes {
  return new Collector() as Mimes;
}

function requestFor(format: string): Request {
  return new Request({ PATH_INFO: `/index.${format}` });
}

describe("Collector#isAnyResponse", () => {
  it("is false when the negotiated format has its own handler", () => {
    const collector = collect();
    collector.html(() => undefined);
    collector.any(() => undefined);
    collector.negotiateFormat(requestFor("html"));

    expect(collector.isAnyResponse()).toBe(false);
  });

  it("is true when only the catch-all handler matches the negotiated format", () => {
    const collector = collect();
    collector.json(() => undefined);
    collector.any(() => undefined);
    collector.negotiateFormat(requestFor("html"));

    expect(collector.isAnyResponse()).toBe(true);
  });

  it("is false when no catch-all handler is registered", () => {
    const collector = collect();
    collector.json(() => undefined);
    collector.negotiateFormat(requestFor("html"));

    expect(collector.isAnyResponse()).toBe(false);
  });
});

describe("Collector#any", () => {
  it("registers the handler for each named format when given format arguments", () => {
    const collector = collect();
    const handler = () => "shared";
    collector.any("xml", "json", handler);

    collector.negotiateFormat(requestFor("xml"));
    expect(collector.isAnyResponse()).toBe(false);
    collector.negotiateFormat(requestFor("json"));
    expect(collector.isAnyResponse()).toBe(false);
    collector.negotiateFormat(requestFor("html"));
    expect(collector.isAnyResponse()).toBe(false);
  });

  it("registers the catch-all when given no format arguments", () => {
    const collector = collect();
    collector.any(() => undefined);
    collector.negotiateFormat(requestFor("html"));

    expect(collector.isAnyResponse()).toBe(true);
  });

  it("aliases all to any", () => {
    const collector = collect();
    collector.all("xml", () => undefined);
    collector.negotiateFormat(requestFor("xml"));

    expect(collector.isAnyResponse()).toBe(false);
  });
});

describe("Collector#custom", () => {
  it("keeps the first registration for a format", () => {
    const collector = collect();
    collector.html(() => "first");
    collector.any("html", () => "second");

    collector.negotiateFormat(requestFor("html"));
    expect(collector.response?.()).toBe("first");
  });

  it("keeps the first registration across repeated custom calls", () => {
    const collector = collect();
    collector.custom(MimeType.HTML, () => "first");
    collector.custom(MimeType.HTML, () => "second");

    collector.negotiateFormat(requestFor("html"));
    expect(collector.response?.()).toBe("first");
  });
});

describe("Collector#initialize", () => {
  it("seeds a response slot for each mime respond_to was called with", () => {
    const collector = new Collector(["xml", "json"]);

    expect(collector.negotiateFormat(new Request({ HTTP_ACCEPT: "application/json" }))).toBe(
      MimeType.JSON,
    );
    expect(collector.negotiateFormat(new Request({ HTTP_ACCEPT: "text/html" }))).toBeNull();
  });
});

describe("Base#respondTo", () => {
  function controller(format: string): Base {
    const base = new Base();
    base.request = new Request({ HTTP_ACCEPT: format }) as unknown as Base["request"];
    base.setResponseBang(new Response());
    return base;
  }

  it("raises when given both types and a block", () => {
    expect(() =>
      controller("text/html").respondTo("html", (format) => {
        format.html(() => undefined);
      }),
    ).toThrow("respond_to takes either types or a block, never both");
  });

  it("negotiates a mime passed without a block", () => {
    expect(() => controller("application/json").respondTo("json")).not.toThrow(UnknownFormat);
  });

  it("registers each mime it was called with", () => {
    let called = false;
    controller("application/json").respondTo((format) => {
      format.json(() => {
        called = true;
      });
    });

    expect(called).toBe(true);
  });

  it("raises RespondToMismatchError when the response media type differs from the negotiated format", () => {
    const base = controller("application/json");
    base.contentType = "text/html";

    expect(() =>
      base.respondTo((format) => {
        format.json(() => undefined);
      }),
    ).toThrow(RespondToMismatchError);
  });

  it("sets the rendered content type from the negotiated format", () => {
    const base = controller("application/json");
    base.respondTo((format) => {
      format.json(() => undefined);
    });

    expect(base.contentType).toMatch(/^application\/json/);
  });
});

describe("Collector#response", () => {
  type Variants = VariantCollector & Record<string, (block?: () => unknown) => void>;

  function controller(variant?: string | string[]): Base {
    const base = new Base();
    const request = new Request({ HTTP_ACCEPT: "text/html" });
    if (variant !== undefined) request.variant = variant;
    base.request = request as unknown as Base["request"];
    base.setResponseBang(new Response());
    return base;
  }

  it("calls the variant block for the inline variant syntax", () => {
    const rendered: string[] = [];
    controller(":phone").respondTo((format) => {
      (format.html() as Variants).none(() => rendered.push("none"));
      (format.html() as Variants).phone(() => rendered.push("phone"));
    });

    expect(rendered).toEqual(["phone"]);
  });

  it("calls the none variant for the inline variant syntax when no variant is set", () => {
    const rendered: string[] = [];
    controller().respondTo((format) => {
      (format.html() as Variants).none(() => rendered.push("none"));
      (format.html() as Variants).phone(() => rendered.push("phone"));
    });

    expect(rendered).toEqual(["none"]);
  });

  it("yields a variant collector to a format block that takes one", () => {
    const rendered: string[] = [];
    controller(":tablet").respondTo((format) => {
      format.html((variant: VariantCollector) => {
        variant.any(":tablet", ":phablet", () => rendered.push("any"));
        (variant as Variants).phone(() => rendered.push("phone"));
      });
    });

    expect(rendered).toEqual(["any"]);
  });

  it("falls back to the any variant for an unmatched variant", () => {
    const rendered: string[] = [];
    controller(":yolo").respondTo((format) => {
      format.html((variant: VariantCollector) => {
        variant.any(() => rendered.push("any"));
        (variant as Variants).phone(() => rendered.push("phone"));
      });
    });

    expect(rendered).toEqual(["any"]);
  });

  it("reuses the catch-all variant collector across blockless any calls", () => {
    const rendered: string[] = [];
    controller(":phone").respondTo((format) => {
      (format.any() as Variants).phone(() => rendered.push("phone"));
      (format.any() as Variants).tablet(() => rendered.push("tablet"));
    });

    expect(rendered).toEqual(["phone"]);
  });

  it("answers a zero-arity format block itself", () => {
    const collector = collect();
    const block = () => "html";
    collector.html(block);
    collector.negotiateFormat(requestFor("html"));

    expect(collector.response).toBe(block);
  });
});

describe("ActionView::Rendering#_process_format", () => {
  class NegotiatedFormatController extends Base {
    async jsonOrHtml(): Promise<void> {
      this.respondTo((format) => {
        format.json();
        format.html();
      });
    }
  }
  NegotiatedFormatController.prependViewPath(
    new FixtureResolver({
      "negotiated_format/jsonOrHtml.html.tse": "HTML",
      "negotiated_format/jsonOrHtml.json.tse": "JSON",
    }),
  );
  NegotiatedFormatController.layout(false);

  it("narrows template lookup to the format respond_to negotiated", async () => {
    const controller = new NegotiatedFormatController();
    const request = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "localhost",
      HTTP_ACCEPT: "*/*",
    });
    await controller.dispatch("jsonOrHtml", request, new Response());

    expect(controller.lookupContext.formats).toEqual([":json"]);
    expect(controller.response.mediaType).toBe("application/json");
    expect(controller.responseBody).toBe("JSON");
  });
});
