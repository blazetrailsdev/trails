import { beforeEach, describe, it } from "vitest";
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
import {
  ArgumentError,
  Module,
  rbModConstSet,
  registerConstant,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { ActionControllerError } from "../metal/exceptions.js";
import { UnsafeRedirectError } from "../metal/redirecting.js";
import { Parameters, UnfilteredParameters } from "../metal/strong-parameters.js";
import { TestCase } from "../test-case.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import type { ToModel } from "../../action-dispatch/routing/polymorphic-routes.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";

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

  override get status(): number {
    throw new RuntimeError("Should not be called!");
  }
  override set status(value: number | string) {
    super.status = value;
  }
  override get location(): string | undefined {
    throw new RuntimeError("Should not be called!");
  }
  override set location(value: string) {
    super.location = value;
  }

  simpleRedirect() {
    this.redirectTo({ action: "hello_world" });
  }

  redirectWithStatus() {
    this.redirectTo({ action: "hello_world", status: 301 });
  }

  redirectWithStatusHash() {
    this.redirectTo({ action: "hello_world" }, { status: 301 });
  }

  redirectWithProtocol() {
    this.redirectTo({ action: "hello_world", protocol: "https" });
  }

  urlRedirectWithStatus() {
    this.redirectTo("http://www.example.com", { status: "moved_permanently" });
  }

  urlRedirectWithStatusHash() {
    this.redirectTo("http://www.example.com", { status: 301 });
  }

  relativeUrlRedirectWithStatus() {
    this.redirectTo("/things/stuff", { status: "found" });
  }

  relativeUrlRedirectWithStatusHash() {
    this.redirectTo("/things/stuff", { status: 301 });
  }

  redirectBackWithStatus() {
    this.redirectBackOrTo("/things/stuff", { status: 307 });
  }

  redirectBackWithStatusAndFallbackLocationToAnotherHost() {
    this.redirectBackOrTo("http://www.rubyonrails.org/", { status: 307 });
  }

  safeRedirectBackWithStatus() {
    this.redirectBackOrTo("/things/stuff", { status: 307, allowOtherHost: false });
  }

  safeRedirectBackWithStatusAndFallbackLocationToAnotherHost() {
    this.redirectBackOrTo("http://www.rubyonrails.org/", { status: 307, allowOtherHost: false });
  }

  safeRedirectToRoot() {
    this.redirectTo(this.urlFrom("/"));
  }

  unsafeRedirect() {
    this.redirectTo("http://www.rubyonrails.org/");
  }

  unsafeRedirectBack() {
    this.redirectBackOrTo("http://www.rubyonrails.org/");
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

  onlyPathRedirect() {
    this.redirectTo({ action: "other_host", onlyPath: true });
  }

  safeRedirectWithFallback() {
    this.redirectTo(this.urlFrom(this.params.get("redirect_url") as string) || "/fallback");
  }

  redirectBackWithExplicitFallbackKwarg() {
    this.redirectBack({ fallbackLocation: "/things/stuff", status: 307 });
  }

  hostRedirect() {
    this.redirectTo({ action: "other_host", onlyPath: false, host: "other.test.host" });
  }

  moduleRedirect() {
    this.redirectTo({ controller: "module_test/module_redirect", action: "hello_world" });
  }

  redirectToUrl() {
    this.redirectTo("http://www.rubyonrails.org/");
  }

  redirectToUrlWithStringlike() {
    const stringlike = {
      toStr() {
        return "http://www.rubyonrails.org/";
      },
    };

    this.redirectTo(stringlike);
  }

  redirectToUrlWithUnescapedQueryString() {
    this.redirectTo("http://example.com/query?status=new");
  }

  redirectToUrlWithComplexScheme() {
    this.redirectTo("x-test+scheme.complex:redirect");
  }

  redirectToUrlWithNetworkPathReference() {
    this.redirectTo("//www.rubyonrails.org/");
  }

  redirectToExistingRecord() {
    this.redirectTo(new Workshop(5));
  }

  redirectToNewRecord() {
    this.redirectTo(new Workshop(null));
  }

  redirectToNil() {
    this.redirectTo(null);
  }

  redirectToPolymorphic() {
    this.redirectTo([":internal", new Workshop(5)]);
  }

  redirectToPolymorphicStringArgs() {
    this.redirectTo(["internal", new Workshop(5)]);
  }

  redirectToParams() {
    this.redirectTo(new Parameters({ status: 200, protocol: "javascript", f: "%0Aeval(name)" }));
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

  redirectWithHeaderBreak() {
    this.redirectTo("/lol\r\nwat");
  }

  redirectWithNullBytes() {
    this.redirectTo("\0/lol\r\nwat");
  }

  async redirectToExternalWithRescue() {
    try {
      this.redirectTo("http://www.rubyonrails.org/", { allowOtherHost: false });
    } catch (e) {
      if (!(e instanceof UnsafeRedirectError)) throw e;
      await this.render({ plain: "caught error" });
    }
  }

  rescueErrors(e: unknown) {
    throw e;
  }

  protected dashboardUrl(id: unknown, message: unknown) {
    return this.urlFor({ action: "dashboard", params: { id, message } });
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
  const assertResponse = (type: number | string): void => tc.assertResponse(type);
  const assertRedirectedTo: OmitThisParameter<TestCase["assertRedirectedTo"]> = (...args) =>
    tc.assertRedirectedTo(...args);

  beforeEach(async ({ task }) => {
    tc = new RedirectTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("simple redirect", async () => {
    await tc.get("simple_redirect");
    assertResponse("redirect");
    assertEqual("http://test.host/redirect/hello_world", tc.redirectToUrl());
  });

  it("redirect with header break", async () => {
    await tc.get("redirect_with_header_break");
    assertResponse("redirect");
    assertEqual("http://test.host/lolwat", tc.redirectToUrl());
  });

  it("redirect with null bytes", async () => {
    await tc.get("redirect_with_null_bytes");
    assertResponse("redirect");
    assertEqual("http://test.host/lolwat", tc.redirectToUrl());
  });

  it("redirect with no status", async () => {
    await tc.get("simple_redirect");
    assertResponse(302);
    assertEqual("http://test.host/redirect/hello_world", tc.redirectToUrl());
  });

  it("redirect with status", async () => {
    await tc.get("redirect_with_status");
    assertResponse(301);
    assertEqual("http://test.host/redirect/hello_world", tc.redirectToUrl());
  });

  it("redirect with status hash", async () => {
    await tc.get("redirect_with_status_hash");
    assertResponse(301);
    assertEqual("http://test.host/redirect/hello_world", tc.redirectToUrl());
  });

  it("redirect with protocol", async () => {
    await tc.get("redirect_with_protocol");
    assertResponse(302);
    assertEqual("https://test.host/redirect/hello_world", tc.redirectToUrl());
  });

  it("url redirect with status", async () => {
    await tc.get("url_redirect_with_status");
    assertResponse(301);
    assertEqual("http://www.example.com", tc.redirectToUrl());
  });

  it("url redirect with status hash", async () => {
    await tc.get("url_redirect_with_status_hash");
    assertResponse(301);
    assertEqual("http://www.example.com", tc.redirectToUrl());
  });

  it("relative url redirect with status", async () => {
    await tc.get("relative_url_redirect_with_status");
    assertResponse(302);
    assertEqual("http://test.host/things/stuff", tc.redirectToUrl());
  });

  it("relative url redirect with status hash", async () => {
    await tc.get("relative_url_redirect_with_status_hash");
    assertResponse(301);
    assertEqual("http://test.host/things/stuff", tc.redirectToUrl());
  });

  it("relative url redirect host with port", async () => {
    tc.request.host = "test.host:1234";
    await tc.get("relative_url_redirect_with_status");
    assertResponse(302);
    assertEqual("http://test.host:1234/things/stuff", tc.redirectToUrl());
  });

  it("simple redirect using options", async () => {
    await tc.get("host_redirect");
    assertResponse("redirect");
    assertRedirectedTo({ action: "other_host", onlyPath: false, host: "other.test.host" });
  });

  it("module redirect", async () => {
    await tc.get("module_redirect");
    assertResponse("redirect");
    assertRedirectedTo("http://test.host/module_test/module_redirect/hello_world");
  });

  it("module redirect using options", async () => {
    await tc.get("module_redirect");
    assertResponse("redirect");
    assertRedirectedTo({ controller: "module_test/module_redirect", action: "hello_world" });
  });

  it("redirect to url", async () => {
    await tc.get("redirect_to_url");
    assertResponse("redirect");
    assertRedirectedTo("http://www.rubyonrails.org/");
  });

  it("redirect to url with stringlike", async () => {
    await tc.get("redirect_to_url_with_stringlike");
    assertResponse("redirect");
    assertRedirectedTo("http://www.rubyonrails.org/");
  });

  it("redirect to url with unescaped query string", async () => {
    await tc.get("redirect_to_url_with_unescaped_query_string");
    assertResponse("redirect");
    assertRedirectedTo("http://example.com/query?status=new");
  });

  it("redirect to url with complex scheme", async () => {
    await tc.get("redirect_to_url_with_complex_scheme");
    assertResponse("redirect");
    assertEqual("x-test+scheme.complex:redirect", tc.redirectToUrl());
  });

  it("redirect to url with network path reference", async () => {
    await tc.get("redirect_to_url_with_network_path_reference");
    assertResponse("redirect");
    assertEqual("//www.rubyonrails.org/", tc.redirectToUrl());
  });

  it("redirect back", async () => {
    const referer = "http://www.example.com/coming/from";
    tc.request.env["HTTP_REFERER"] = referer;

    await tc.get("redirect_back_with_status");

    assertResponse(307);
    assertEqual(referer, tc.redirectToUrl());
  });

  it("redirect back with no referer", async () => {
    await tc.get("redirect_back_with_status");

    assertResponse(307);
    assertEqual("http://test.host/things/stuff", tc.redirectToUrl());
  });

  it("redirect back with no referer redirects to another host", async () => {
    await tc.get("redirect_back_with_status_and_fallback_location_to_another_host");

    assertResponse(307);
    assertEqual("http://www.rubyonrails.org/", tc.redirectToUrl());
  });

  it("safe redirect back from other host", async () => {
    tc.request.env["HTTP_REFERER"] = "http://another.host/coming/from";
    await tc.get("safe_redirect_back_with_status");

    assertResponse(307);
    assertEqual("http://test.host/things/stuff", tc.redirectToUrl());
  });

  it("safe redirect back from the same host", async () => {
    const referer = "http://test.host/coming/from";
    tc.request.env["HTTP_REFERER"] = referer;
    await tc.get("safe_redirect_back_with_status");

    assertResponse(307);
    assertEqual(referer, tc.redirectToUrl());
  });

  it("safe redirect back with no referer", async () => {
    await tc.get("safe_redirect_back_with_status");

    assertResponse(307);
    assertEqual("http://test.host/things/stuff", tc.redirectToUrl());
  });

  it("safe redirect back with no referer redirects to another host", async () => {
    await tc.get("safe_redirect_back_with_status_and_fallback_location_to_another_host");

    assertResponse(307);
    assertEqual("http://www.rubyonrails.org/", tc.redirectToUrl());
  });

  it("safe redirect to root", async () => {
    await tc.get("safe_redirect_to_root");

    assertEqual("http://test.host/", tc.redirectToUrl());
  });

  it("redirect back with explicit fallback kwarg", async () => {
    const referer = "http://www.example.com/coming/from";
    tc.request.env["HTTP_REFERER"] = referer;

    await tc.get("redirect_back_with_explicit_fallback_kwarg");

    assertResponse(307);
    assertEqual(referer, tc.redirectToUrl());
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
      assertRedirectedTo(new Workshop(5));

      await tc.get("redirect_to_new_record");
      assertEqual("http://test.host/workshops", tc.redirectToUrl());
      assertRedirectedTo(new Workshop(null));
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
      assertRedirectedTo([":internal", new Workshop(5)]);
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

  it("redirect to nil", async () => {
    const error = await assertRaise([ActionControllerError], {}, async () => {
      await tc.get("redirect_to_nil");
    });
    assertEqual("Cannot redirect to nil!", error.message);
  });

  it("redirect to params", async () => {
    const error = await assertRaise([UnfilteredParameters], {}, async () => {
      await tc.get("redirect_to_params");
    });
    assertEqual("unable to convert unpermitted parameters to hash", error.message);
  });

  it("redirect to with block", async () => {
    await tc.get("redirect_to_with_block");
    assertResponse("redirect");
    assertRedirectedTo("http://www.rubyonrails.org/");
  });

  it("redirect to with block and assigns", async () => {
    await tc.get("redirect_to_with_block_and_assigns");
    assertResponse("redirect");
    assertRedirectedTo("http://www.rubyonrails.org/");
  });

  it("redirect to out of scope block", async () => {
    await tc.get("redirect_to_out_of_scope_block");
    assertResponse("redirect");
    assertRedirectedTo("http://test.host/redirect/redirect_to_out_of_scope_block");
  });

  it("redirect to with block and accepted options", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("redirect_to_with_block_and_options");

      assertResponse("redirect");
      assertRedirectedTo("http://test.host/redirect/hello_world");
    });
  });

  it("unsafe redirect", async () => {
    await withRaiseOnOpenRedirects(async () => {
      const error = await assertRaise([UnsafeRedirectError], {}, async () => {
        await tc.get("unsafe_redirect");
      });

      assertEqual(
        'Unsafe redirect to "http://www.rubyonrails.org/", pass allow_other_host: true to redirect anyway.',
        error.message,
      );
    });
  });

  it("unsafe redirect back", async () => {
    await withRaiseOnOpenRedirects(async () => {
      const error = await assertRaise([UnsafeRedirectError], {}, async () => {
        await tc.get("unsafe_redirect_back");
      });

      assertEqual(
        'Unsafe redirect to "http://www.rubyonrails.org/", pass allow_other_host: true to redirect anyway.',
        error.message,
      );
    });
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

  it("only path redirect", async () => {
    await withRaiseOnOpenRedirects(async () => {
      await tc.get("only_path_redirect");
      assertResponse("redirect");
      assertRedirectedTo("/redirect/other_host");
    });
  });

  it("url from", async () => {
    await withRaiseOnOpenRedirects(async () => {
      await tc.get("safe_redirect_with_fallback", {
        params: { redirect_url: "http://test.host/app" },
      });
      assertResponse("redirect");
      assertRedirectedTo("http://test.host/app");
    });
  });

  it("url from fallback", async () => {
    await withRaiseOnOpenRedirects(async () => {
      await tc.get("safe_redirect_with_fallback", {
        params: { redirect_url: "http://www.rubyonrails.org/" },
      });
      assertResponse("redirect");
      assertRedirectedTo("http://test.host/fallback");

      await tc.get("safe_redirect_with_fallback", { params: { redirect_url: "" } });
      assertResponse("redirect");
      assertRedirectedTo("http://test.host/fallback");
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
    await tc.get("redirect_to_external_with_rescue");
    assertResponse("ok");
  });
});

const ModuleTest = new Module() as Module & { ModuleRedirectController: typeof RedirectController };
registerConstant("ModuleTest", ModuleTest);
rbModConstSet(
  ModuleTest,
  "ModuleRedirectController",
  class ModuleRedirectController extends RedirectController {
    override moduleRedirect() {
      this.redirectTo({ controller: "/redirect", action: "hello_world" });
    }
  },
);

describe("ModuleRedirectTest", () => {
  class ModuleRedirectTest extends TestCase {
    static {
      this.tests(ModuleTest.ModuleRedirectController);
    }
  }

  let tc: ModuleRedirectTest;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);
  const assertRedirectedTo: OmitThisParameter<TestCase["assertRedirectedTo"]> = (...args) =>
    tc.assertRedirectedTo(...args);

  beforeEach(async ({ task }) => {
    tc = new ModuleRedirectTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("simple redirect", async () => {
    await tc.get("simple_redirect");
    assertResponse("redirect");
    assertEqual("http://test.host/module_test/module_redirect/hello_world", tc.redirectToUrl());
  });

  it("simple redirect using options", async () => {
    await tc.get("host_redirect");
    assertResponse("redirect");
    assertRedirectedTo({ action: "other_host", onlyPath: false, host: "other.test.host" });
  });

  it("module redirect", async () => {
    await tc.get("module_redirect");
    assertResponse("redirect");
    assertEqual("http://test.host/redirect/hello_world", tc.redirectToUrl());
  });

  it("module redirect using options", async () => {
    await tc.get("module_redirect");
    assertResponse("redirect");
    assertRedirectedTo({ controller: "/redirect", action: "hello_world" });
  });
});
