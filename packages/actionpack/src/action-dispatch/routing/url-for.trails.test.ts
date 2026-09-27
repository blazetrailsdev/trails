import { describe, expect, it } from "vitest";

import { include } from "@blazetrails/ruby-compat";

import { UrlFor } from "./url-for.js";

describe("ActionDispatch::Routing::UrlFor included", () => {
  it("gives a class a default_url_options class attribute", () => {
    class Host {
      declare static defaultUrlOptions: Record<string, unknown>;
    }
    include(Host, UrlFor);
    expect(Host.defaultUrlOptions).toEqual({});
    expect((new Host() as { urlOptions(): unknown }).urlOptions()).toEqual({});
  });

  it("keeps a default_url_options the class already defines", () => {
    class Host {
      get defaultUrlOptions(): Record<string, unknown> {
        return { host: "example.com" };
      }
    }
    include(Host, UrlFor);
    expect(Object.hasOwn(Host, "defaultUrlOptions")).toBe(false);
  });

  it("includes the class's _url_for_modules", () => {
    class Extra {
      extra(): string {
        return "extra";
      }
    }
    class Host {
      static _urlForModules(): typeof Extra {
        return Extra;
      }
    }
    include(Host, UrlFor);
    expect((new Host() as unknown as Extra).extra()).toBe("extra");
  });
});
