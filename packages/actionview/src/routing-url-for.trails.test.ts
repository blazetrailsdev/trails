import { beforeEach, describe, expect, it } from "vitest";
import { RoutingUrlFor, type RoutingUrlForHost } from "./routing-url-for.js";
import { _setUrlFor, type UrlForImplementation } from "./routing-url-for-slot.js";

class Parameters {
  constructor(private readonly data: Record<string, unknown>) {}
  hasKey(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }
  get(key: string): unknown {
    return this.data[key];
  }
  set(key: string, value: unknown): void {
    this.data[key] = value;
  }
  toH(): Record<string, unknown> {
    return { ...this.data };
  }
}

const builder = {
  handleStringCall: (_target: unknown, name: string) => `string:${name}`,
  handleClassCall: (_target: unknown, klass: unknown) =>
    `class:${(klass as { name: string }).name}`,
  handleModelCall: (_target: unknown, record: unknown) => `model:${(record as { id: number }).id}`,
};

interface Host extends RoutingUrlFor, RoutingUrlForHost {
  seen: unknown[];
}

let host: Host;

function stubUrlFor(): void {
  _setUrlFor({
    urlFor(this: Host, options?: unknown) {
      this.seen.push(options);
      return "/super";
    },
    urlOptions: () => ({ host: "example.com" }),
    optimizeRoutesGeneration: () => true,
    polymorphicPath: (record: unknown, options: unknown) =>
      `path:${JSON.stringify([record, options])}`,
    polymorphicUrl: (record: unknown, options: unknown) =>
      `url:${JSON.stringify([record, options])}`,
    isParameters: (value: unknown) => value instanceof Parameters,
    helperMethodBuilder: { path: () => builder, url: () => builder },
  } as unknown as UrlForImplementation);
}

beforeEach(() => {
  stubUrlFor();
  host = Object.assign(Object.create(RoutingUrlFor.prototype) as RoutingUrlFor, {
    controller: null as unknown,
    seen: [] as unknown[],
    _backUrl: () => "http://www.example.com",
  }) as Host;
});

class Workshop {
  constructor(readonly id: number) {}
}

describe("ActionView::RoutingUrlFor#url_for", () => {
  it("passes a String straight through", () => {
    expect(host.urlFor("http://www.example.com")).toBe("http://www.example.com");
  });

  it("asks for the current page when given nil", () => {
    expect(host.urlFor(null)).toBe("/super");
    expect(host.seen[0]).toEqual({ only_path: true });
  });

  it("defaults :only_path on a Hash unless :host is given", () => {
    host.urlFor({ action: "index" });
    expect(host.seen[0]).toEqual({ action: "index", only_path: true });

    host.urlFor({ action: "index", host: "example.com" });
    expect(host.seen[1]).toEqual({ action: "index", host: "example.com" });
  });

  it("does not mutate the Hash the caller passed", () => {
    const options = { action: "index" };
    host.urlFor(options);
    expect(options).toEqual({ action: "index" });
  });

  it("honors an explicit only_path: false", () => {
    host.urlFor({ action: "index", only_path: false });
    expect(host.seen[0]).toEqual({ action: "index", only_path: false });
  });

  it("routes ActionController::Parameters through super", () => {
    const params = new Parameters({ action: "index" });
    expect(host.urlFor(params)).toBe("/super");
    expect(host.seen[0]).toBe(params);
  });

  it("defaults :only_path through the Parameters writer, not a bare property", () => {
    const params = new Parameters({ action: "index" });
    host.urlFor(params);
    expect(params.hasKey("only_path")).toBe(true);
    expect(params.get("only_path")).toBe(true);
    expect(params.toH()).toEqual({ action: "index", only_path: true });
  });

  it("leaves :only_path alone on Parameters carrying a :host", () => {
    const params = new Parameters({ action: "index", host: "example.com" });
    host.urlFor(params);
    expect(params.hasKey("only_path")).toBe(false);
  });

  it("routes a Symbol through handle_string_call", () => {
    expect(host.urlFor(":root")).toBe("string:root");
  });

  it("routes a Class through handle_class_call", () => {
    expect(host.urlFor(Workshop)).toBe("class:Workshop");
  });

  it("routes a record through handle_model_call", () => {
    expect(host.urlFor(new Workshop(5))).toBe("model:5");
  });

  it("returns _back_url for :back", () => {
    expect(host.urlFor(":back")).toBe("http://www.example.com");
  });

  it("routes an Array through polymorphic_path when only_path", () => {
    const record = new Workshop(1);
    expect(host.urlFor([record])).toBe(`path:${JSON.stringify([[record], { only_path: true }])}`);
  });

  it("routes an Array through polymorphic_url when not only_path", () => {
    const record = new Workshop(1);
    expect(host.urlFor([record, { host: "example.com" }])).toBe(
      `url:${JSON.stringify([[record], { host: "example.com" }])}`,
    );
  });
});

describe("ActionView::RoutingUrlFor#url_options", () => {
  it("delegates to the controller when it responds to url_options", () => {
    host.controller = { urlOptions: () => ({ script_name: "/app" }) };
    expect(host.urlOptions()).toEqual({ script_name: "/app" });
  });

  it("falls back to super when the controller does not", () => {
    expect(host.urlOptions()).toEqual({ host: "example.com" });
  });
});

describe("ActionView::RoutingUrlFor private helpers", () => {
  it("_routes_context is the controller", () => {
    host.controller = { name: "posts" };
    expect(host._routesContext()).toBe(host.controller);
  });

  it("_generate_paths_by_default is true", () => {
    expect(host._generatePathsByDefault()).toBe(true);
  });

  it("ensure_only_path_option leaves an existing key alone", () => {
    const options: Record<string, unknown> = { only_path: false };
    host.ensureOnlyPathOption(options);
    expect(options).toEqual({ only_path: false });
  });
});
