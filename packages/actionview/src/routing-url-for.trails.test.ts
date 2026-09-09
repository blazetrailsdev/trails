import { beforeEach, describe, expect, it } from "vitest";
import { HelperMethodBuilder, Parameters } from "@blazetrails/actionpack";
import {
  _generatePathsByDefault,
  _routesContext,
  ensureOnlyPathOption,
  urlFor,
  urlOptions,
  type RoutingUrlForHost,
} from "./routing-url-for.js";
import { _setUrlFor, type UrlForImplementation } from "./routing-url-for-slot.js";

interface Host extends RoutingUrlForHost {
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
    polymorphicPath: (record, options) => `path:${JSON.stringify([record, options])}`,
    polymorphicUrl: (record, options) => `url:${JSON.stringify([record, options])}`,
    isParameters: (value) => value instanceof Parameters,
    helperMethodBuilder: HelperMethodBuilder,
  } as unknown as UrlForImplementation);
}

beforeEach(() => {
  stubUrlFor();
  host = { controller: null, seen: [], _backUrl: () => "http://www.example.com" };
});

class Workshop {
  constructor(readonly id: number) {}
}

describe("ActionView::RoutingUrlFor#url_for", () => {
  it("passes a String straight through", () => {
    expect(urlFor.call(host, "http://www.example.com")).toBe("http://www.example.com");
  });

  it("asks for the current page when given nil", () => {
    expect(urlFor.call(host, null)).toBe("/super");
    expect(host.seen[0]).toEqual({ only_path: true });
  });

  it("defaults :only_path on a Hash unless :host is given", () => {
    urlFor.call(host, { action: "index" });
    expect(host.seen[0]).toEqual({ action: "index", only_path: true });

    urlFor.call(host, { action: "index", host: "example.com" });
    expect(host.seen[1]).toEqual({ action: "index", host: "example.com" });
  });

  it("does not mutate the Hash the caller passed", () => {
    const options = { action: "index" };
    urlFor.call(host, options);
    expect(options).toEqual({ action: "index" });
  });

  it("honors an explicit only_path: false", () => {
    urlFor.call(host, { action: "index", only_path: false });
    expect(host.seen[0]).toEqual({ action: "index", only_path: false });
  });

  it("routes ActionController::Parameters through super", () => {
    const params = new Parameters({ action: "index" });
    expect(urlFor.call(host, params)).toBe("/super");
  });

  it("returns _back_url for :back", () => {
    expect(urlFor.call(host, ":back")).toBe("http://www.example.com");
  });

  it("routes an Array through polymorphic_path when only_path", () => {
    const record = new Workshop(1);
    expect(urlFor.call(host, [record])).toBe(
      `path:${JSON.stringify([[record], { only_path: true }])}`,
    );
  });

  it("routes an Array through polymorphic_url when not only_path", () => {
    const record = new Workshop(1);
    expect(urlFor.call(host, [record, { host: "example.com" }])).toBe(
      `url:${JSON.stringify([[record], { host: "example.com" }])}`,
    );
  });
});

describe("ActionView::RoutingUrlFor#url_options", () => {
  it("delegates to the controller when it responds to url_options", () => {
    host.controller = { urlOptions: () => ({ script_name: "/app" }) };
    expect(urlOptions.call(host)).toEqual({ script_name: "/app" });
  });

  it("falls back to super when the controller does not", () => {
    expect(urlOptions.call(host)).toEqual({ host: "example.com" });
  });
});

describe("ActionView::RoutingUrlFor private helpers", () => {
  it("_routes_context is the controller", () => {
    host.controller = { name: "posts" };
    expect(_routesContext.call(host)).toBe(host.controller);
  });

  it("_generate_paths_by_default is true", () => {
    expect(_generatePathsByDefault.call(host)).toBe(true);
  });

  it("ensure_only_path_option leaves an existing key alone", () => {
    const options: Record<string, unknown> = { only_path: false };
    ensureOnlyPathOption.call(host, options);
    expect(options).toEqual({ only_path: false });
  });
});
