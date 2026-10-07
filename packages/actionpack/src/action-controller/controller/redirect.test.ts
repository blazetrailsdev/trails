import { beforeEach, describe, it, expect } from "vitest";
import { Conversion, Naming } from "@blazetrails/activemodel";
import {
  assertEqual,
  assertRaise,
  assertRaises,
  extend,
  include,
  isPresent,
  Notifications,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { UnsafeRedirectError } from "../metal/redirecting.js";
import { TestCase } from "../test-case.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import type { ToModel } from "../../action-dispatch/routing/polymorphic-routes.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { redirectTo, redirectBack } from "../../action-dispatch/redirect.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}
function makeResponse(): Response {
  return new Response();
}

class Workshop {
  declare toModel: ToModel["toModel"];

  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  static OUT_OF_SCOPE_BLOCK = function (this: unknown): string {
    if (!(this instanceof RedirectController)) {
      throw new Error("Not executed in controller's context");
    }
    return this.request.originalUrl;
  };

  constructor(public id: number | null) {}

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  toString(): string {
    return String(this.id ?? "");
  }
}

class RedirectController extends Base {
  declare url: string;

  simpleRedirect() {
    this.redirectTo({ action: "hello_world" });
  }

  unsafeRedirectMalformed() {
    this.redirectTo("http:///www.rubyonrails.org/");
  }

  unsafeRedirectProtocolRelativeDoubleSlash() {
    this.redirectTo("//www.rubyonrails.org/");
  }

  unsafeRedirectProtocolRelativeTripleSlash() {
    this.redirectTo("///www.rubyonrails.org/");
  }

  unsafeRedirectWithIllegalHttpHeaderValueCharacter() {
    this.redirectTo("javascript:alert(document.domain)\b", { allowOtherHost: true });
  }

  safeRedirectWithFallback() {
    this.redirectTo(this.urlFrom(this.params.get("redirect_url") as string) || "/fallback");
  }

  redirectToExistingRecord() {
    this.redirectTo(new Workshop(5));
  }

  redirectToNewRecord() {
    this.redirectTo(new Workshop(null));
  }

  redirectToPolymorphic() {
    this.redirectTo([":internal", new Workshop(5)]);
  }

  redirectToPolymorphicStringArgs() {
    this.redirectTo(["internal", new Workshop(5)]);
  }

  redirectToWithBlock() {
    this.redirectTo(() => "http://www.rubyonrails.org/");
  }

  redirectToWithBlockAndAssigns() {
    this.url = "http://www.rubyonrails.org/";
    this.redirectTo(function (this: RedirectController) {
      return this.url;
    });
  }

  redirectToWithBlockAndOptions() {
    this.redirectTo(() => ({ action: "hello_world" }));
  }

  redirectToOutOfScopeBlock() {
    this.redirectTo(Workshop.OUT_OF_SCOPE_BLOCK);
  }
}

async function withRaiseOnOpenRedirects(block: () => Promise<void>): Promise<void> {
  const oldRaiseOnOpenRedirects = Base.raiseOnOpenRedirects;
  Base.raiseOnOpenRedirects = true;
  try {
    await block();
  } finally {
    Base.raiseOnOpenRedirects = oldRaiseOnOpenRedirects;
  }
}

describe("RedirectTest", () => {
  class RedirectTest extends TestCase {
    static {
      this.tests(RedirectController);
    }
  }

  let tc: RedirectTest;

  beforeEach(async ({ task }) => {
    tc = new RedirectTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("simple redirect", () => {
    const result = redirectTo("http://example.com/posts");
    expect(result.status).toBe(302);
    expect(result.location).toBe("http://example.com/posts");
    expect(result.body).toContain("redirected");
  });

  it("redirect with header break", () => {
    expect(() => redirectTo("http://example.com\r\ninjection")).toThrow(/header break/);
  });

  it("redirect with null bytes", () => {
    expect(() => redirectTo("http://example.com\0evil")).toThrow(/null bytes/);
  });

  it("redirect with no status", () => {
    const result = redirectTo("/posts");
    expect(result.status).toBe(302);
  });

  it("redirect with status", () => {
    const result = redirectTo("/posts", { status: 301 });
    expect(result.status).toBe(301);
  });

  it("redirect with status hash", () => {
    const result = redirectTo("/posts", { status: 307 });
    expect(result.status).toBe(307);
  });

  it("redirect with protocol", () => {
    const result = redirectTo("https://example.com/posts");
    expect(result.location).toBe("https://example.com/posts");
  });

  it("url redirect with status", () => {
    const result = redirectTo("http://example.com/", { status: 301 });
    expect(result.status).toBe(301);
    expect(result.location).toBe("http://example.com/");
  });

  it("url redirect with status hash", () => {
    const result = redirectTo("http://example.com/", { status: 303 });
    expect(result.status).toBe(303);
  });

  it("relative url redirect with status", () => {
    const result = redirectTo("/relative/path", { status: 301 });
    expect(result.status).toBe(301);
    expect(result.location).toBe("/relative/path");
  });

  it("relative url redirect with status hash", () => {
    const result = redirectTo("/foo", { status: 307 });
    expect(result.status).toBe(307);
  });

  it("relative url redirect host with port", () => {
    const result = redirectTo("http://example.com:3000/foo");
    expect(result.location).toBe("http://example.com:3000/foo");
  });

  it("simple redirect using options", () => {
    const result = redirectTo("/dashboard", { status: 302 });
    expect(result.status).toBe(302);
    expect(result.location).toBe("/dashboard");
  });

  it("module redirect", () => {
    const result = redirectTo("/admin/dashboard");
    expect(result.location).toBe("/admin/dashboard");
  });

  it("module redirect using options", () => {
    const result = redirectTo("/admin/dashboard", { status: 301 });
    expect(result.status).toBe(301);
  });

  it("redirect to url", () => {
    const result = redirectTo("http://www.example.com");
    expect(result.location).toBe("http://www.example.com");
  });

  it("redirect to url with unescaped query string", () => {
    const result = redirectTo("http://example.com?a=1&b=2");
    expect(result.location).toBe("http://example.com?a=1&b=2");
  });

  it("redirect to url with complex scheme", () => {
    const result = redirectTo("data:text/html,test");
    expect(result.location).toBe("data:text/html,test");
  });

  it("redirect to url with network path reference", () => {
    const result = redirectTo("//cdn.example.com/file.js");
    expect(result.location).toBe("//cdn.example.com/file.js");
  });

  it("redirect back", () => {
    const result = redirectBack({
      referer: "http://example.com/prev",
      fallbackLocation: "/",
    });
    expect(result.location).toBe("http://example.com/prev");
  });

  it("redirect back with no referer", () => {
    const result = redirectBack({
      fallbackLocation: "/",
    });
    expect(result.location).toBe("/");
  });

  it("redirect back with no referer redirects to another host", () => {
    const result = redirectBack({
      fallbackLocation: "http://other.com/",
    });
    expect(result.location).toBe("http://other.com/");
  });

  it("safe redirect back from other host", () => {
    const result = redirectBack({
      referer: "http://evil.com/attack",
      fallbackLocation: "/",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("/");
  });

  it("safe redirect back from the same host", () => {
    const result = redirectBack({
      referer: "http://example.com/prev",
      fallbackLocation: "/",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("http://example.com/prev");
  });

  it("safe redirect back with no referer", () => {
    const result = redirectBack({
      fallbackLocation: "/fallback",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("/fallback");
  });

  it("safe redirect back with no referer redirects to another host", () => {
    const result = redirectBack({
      fallbackLocation: "http://other.com/",
      allowOtherHost: false,
      currentHost: "example.com",
    });
    expect(result.location).toBe("http://other.com/");
  });

  it("safe redirect to root", () => {
    const result = redirectTo("/");
    expect(result.location).toBe("/");
    expect(result.status).toBe(302);
  });

  it("redirect back with explicit fallback kwarg", () => {
    const result = redirectBack({
      fallbackLocation: "/dashboard",
    });
    expect(result.location).toBe("/dashboard");
  });

  it("redirect to record", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("workshops");

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("redirect_to_existing_record");
      assertEqual("http://test.host/workshops/5", tc.redirectToUrl());
      tc.assertRedirectedTo(new Workshop(5));

      await tc.get("redirect_to_new_record");
      assertEqual("http://test.host/workshops", tc.redirectToUrl());
      tc.assertRedirectedTo(new Workshop(null));
    });
  });

  it("polymorphic redirect", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("internal", () => {
          this.resources("workshops");
        });

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("redirect_to_polymorphic");
      assertEqual("http://test.host/internal/workshops/5", tc.redirectToUrl());
      tc.assertRedirectedTo([":internal", new Workshop(5)]);
    });
  });

  it("polymorphic redirect with string args", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.namespace("internal", () => {
          this.resources("workshops");
        });

        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      const error = await assertRaises([ArgumentError], {}, async () => {
        await tc.get("redirect_to_polymorphic_string_args");
      });
      assertEqual("Please use symbols for polymorphic route arguments.", error.message);
    });
  });

  it("redirect to url with stringlike", () => {
    const url = new URL("http://example.com/path");
    const result = redirectTo(url);
    expect(result.location).toBe("http://example.com/path");
  });

  it("redirect to nil", () => {
    expect(() => redirectTo(null)).toThrow("Cannot redirect to nil!");
  });

  it("redirect to params", () => {
    const result = redirectTo("/posts?page=2");
    expect(result.location).toBe("/posts?page=2");
  });

  it("redirect to with block", async () => {
    await tc.get("redirect_to_with_block");
    tc.assertResponse("redirect");
    tc.assertRedirectedTo("http://www.rubyonrails.org/");
  });

  it("redirect to with block and assigns", async () => {
    await tc.get("redirect_to_with_block_and_assigns");
    tc.assertResponse("redirect");
    tc.assertRedirectedTo("http://www.rubyonrails.org/");
  });

  it("redirect to out of scope block", async () => {
    await tc.get("redirect_to_out_of_scope_block");
    tc.assertResponse("redirect");
    tc.assertRedirectedTo("http://test.host/redirect/redirect_to_out_of_scope_block");
  });

  it("redirect to with block and accepted options", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("redirect_to_with_block_and_options");

      tc.assertResponse("redirect");
      tc.assertRedirectedTo("http://test.host/redirect/hello_world");
    });
  });

  it("unsafe redirect", () => {
    const result = redirectTo("http://evil.com/attack");
    expect(result.location).toBe("http://evil.com/attack");
  });

  it("unsafe redirect back", () => {
    const result = redirectBack({
      referer: "http://evil.com/attack",
      fallbackLocation: "/",
      allowOtherHost: true,
    });
    expect(result.location).toBe("http://evil.com/attack");
  });

  it("unsafe redirect with malformed url", async () => {
    await withRaiseOnOpenRedirects(async () => {
      const error = await assertRaise([UnsafeRedirectError], {}, async () => {
        await tc.get("unsafe_redirect_malformed");
      });

      assertEqual(
        'Unsafe redirect to "http:///www.rubyonrails.org/", pass allow_other_host: true to redirect anyway.',
        error.message,
      );
    });
  });

  it("unsafe redirect with protocol relative double slash url", async () => {
    await withRaiseOnOpenRedirects(async () => {
      const error = await assertRaise([UnsafeRedirectError], {}, async () => {
        await tc.get("unsafe_redirect_protocol_relative_double_slash");
      });

      assertEqual(
        'Unsafe redirect to "//www.rubyonrails.org/", pass allow_other_host: true to redirect anyway.',
        error.message,
      );
    });
  });

  it("unsafe redirect with protocol relative triple slash url", async () => {
    await withRaiseOnOpenRedirects(async () => {
      const error = await assertRaise([UnsafeRedirectError], {}, async () => {
        await tc.get("unsafe_redirect_protocol_relative_triple_slash");
      });

      assertEqual(
        'Unsafe redirect to "///www.rubyonrails.org/", pass allow_other_host: true to redirect anyway.',
        error.message,
      );
    });
  });

  it("unsafe redirect with illegal http header value character", async () => {
    await withRaiseOnOpenRedirects(async () => {
      const error = await assertRaise([UnsafeRedirectError], {}, async () => {
        await tc.get("unsafe_redirect_with_illegal_http_header_value_character");
      });

      const msg =
        "The redirect URL javascript:alert(document.domain)\b contains one or more illegal HTTP header field character. " +
        "Set of legal characters defined in https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6";

      assertEqual(msg, error.message);
    });
  });

  it("only path redirect", () => {
    const result = redirectTo("/only/this/path");
    expect(result.location).toBe("/only/this/path");
    expect(result.status).toBe(302);
  });

  it("url from", async () => {
    await withRaiseOnOpenRedirects(async () => {
      await tc.get("safe_redirect_with_fallback", {
        params: { redirect_url: "http://test.host/app" },
      });
      tc.assertResponse("redirect");
      tc.assertRedirectedTo("http://test.host/app");
    });
  });

  it("url from fallback", async () => {
    await withRaiseOnOpenRedirects(async () => {
      await tc.get("safe_redirect_with_fallback", {
        params: { redirect_url: "http://www.rubyonrails.org/" },
      });
      tc.assertResponse("redirect");
      tc.assertRedirectedTo("http://test.host/fallback");

      await tc.get("safe_redirect_with_fallback", { params: { redirect_url: "" } });
      tc.assertResponse("redirect");
      tc.assertRedirectedTo("http://test.host/fallback");
    });
  });

  it("redirect to instrumentation", async () => {
    let payload: Record<string, unknown> | null = null;

    const subscriber = (event: { payload: Record<string, unknown> }) => {
      payload = event.payload;
    };

    await Notifications.subscribed(subscriber, "redirect_to.action_controller", async () => {
      await tc.get("simple_redirect");
    });

    assertEqual(tc.request, payload!.request);
    assertEqual(302, payload!.status);
    assertEqual("http://test.host/redirect/hello_world", payload!.location);
  });

  it("redirect to external with rescue", async () => {
    class C extends Base {
      async action() {
        this.redirectTo("http://external.com");
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.headers.get("location")).toBe("http://external.com");
    expect(c.status).toBe(302);
  });
});

describe("ModuleRedirectTest", () => {
  it("simple redirect", () => {
    const result = redirectTo("/module/dashboard");
    expect(result.location).toBe("/module/dashboard");
    expect(result.status).toBe(302);
  });

  it("simple redirect using options", () => {
    const result = redirectTo("/module/dashboard", { status: 301 });
    expect(result.status).toBe(301);
  });

  it("module redirect", () => {
    const result = redirectTo("/admin/module/dashboard");
    expect(result.location).toBe("/admin/module/dashboard");
  });

  it("module redirect using options", () => {
    const result = redirectTo("/admin/module/dashboard", { status: 307 });
    expect(result.status).toBe(307);
  });
});
