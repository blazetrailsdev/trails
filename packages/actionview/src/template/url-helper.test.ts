/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionController, Request, RouteSet, UrlFor } from "@blazetrails/actionpack";
import { Conversion, Naming } from "@blazetrails/activemodel";
import { assertPredicate, extend, isHtmlSafe, isPresent } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { ArgumentError, include } from "@blazetrails/ruby-compat";
import { RoutingUrlFor } from "../routing-url-for.js";
import { Base } from "../base.js";
import { setPrependContentExfiltrationPrevention } from "../helpers/content-exfiltration-prevention-helper.js";
import * as UrlHelper from "../helpers/url-helper.js";
import { raw } from "../helpers/output-safety-helper.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";

class Workshop {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  id: unknown;

  constructor(id: unknown) {
    this.id = id;
  }

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  toString(): string {
    return `Workshop ${this.id}`;
  }
}

class Session {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  id: unknown;
  workshopId: unknown;

  constructor(id: unknown) {
    this.id = id;
  }

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  toString(): string {
    return String(this.id ?? "");
  }
}

function viewWith(controller: unknown): Base {
  return Base.withViewPaths([], {}, controller);
}

const normalizeDom = (html: unknown): string =>
  String(html)
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replace(/<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>/g, (_m, name, attrs, close) => {
      const sorted = (attrs.match(/[\w-]+="[^"]*"/g) ?? []).sort().join(" ");
      return `<${name}${sorted ? " " + sorted : ""}${close}>`;
    });

const assertDomEqual = (expected: string, actual: unknown): void => {
  expect(normalizeDom(actual)).toEqual(normalizeDom(expected));
};

include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);

const routes = new RouteSet();
routes.draw((r) => {
  r.get("/", { to: "foo#bar" });
  r.get("/other", { to: "foo#other" });
  r.get("/article/:id", { to: "foo#article", as: "article" });
  r.get("/category/:category", { to: "foo#category" });
  r.resources("sessions");
  r.resources("workshops", (r) => {
    r.resources("sessions");
  });

  r.scope("engine", (r) => {
    r.get("/", { to: "foo#bar" });
  });
});

class UrlHelperView extends Base {}
include(UrlHelperView, routes.urlHelpers());

const hashFor = (options: Record<string, unknown> = {}): Record<string, unknown> => ({
  controller: "foo",
  action: "bar",
  ...options,
});
const urlHash = hashFor;

const renderTse = (string: string): string => {
  const template = new Template(
    string.trim(),
    "test template",
    TemplateHandlers.handlerForExtension("tse")!,
    { format: ":html", locals: [] },
  );
  const view = Base.withEmptyTemplateCache();
  return String(template.render(view.empty(), {})).trim();
};

function controllerWithReferer(env: Record<string, unknown>): unknown {
  return { request: { env } };
}

describe("UrlHelperTest", () => {
  it("url for with back", () => {
    const referer = "http://www.example.com/referer";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));

    expect(view.urlFor(":back")).toBe("http://www.example.com/referer");
  });

  it("url for with back and no referer", () => {
    const view = viewWith(controllerWithReferer({}));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for with back and no controller", () => {
    const view = viewWith(null);
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for with back and javascript referer", () => {
    const referer = "javascript:alert(document.cookie)";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for does not escape urls", () => {
    expect(view.urlFor(hashFor({ a: "b", c: "d" }))).toBe("/?a=b&c=d");
  });

  it("url for does not include empty hashes", () => {
    const view = UrlHelperView.withViewPaths([]) as any;
    expect(view.urlFor(hashFor({ a: {} }))).toBe("/");
  });

  it("url for with invalid referer", () => {
    const referer = "THIS IS NOT A URL";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  it("url for with array defaults to only path true", () => {
    expect(view.urlFor([":other", { controller: "foo" }])).toBe("/other");
  });

  it("url for with array and only path set to false", () => {
    view.defaultUrlOptions["host"] = "http://example.com";
    expect(view.urlFor([":other", { controller: "foo", onlyPath: false }])).toBe(
      "http://example.com/other",
    );
  });

  let requestForgery = false;
  let view: any;

  beforeEach(() => {
    view = UrlHelperView.withViewPaths([], {}, null);
    Object.defineProperties(view, {
      isProtectAgainstForgery: { value: () => requestForgery, configurable: true },
      formAuthenticityToken: { value: () => "secret" },
      requestForgeryProtectionToken: { value: "form_token" },
    });
    UrlHelper.setButtonToGeneratesButtonTag(true);
  });

  afterEach(() => {
    requestForgery = false;
    UrlHelper.setButtonToGeneratesButtonTag(true);
  });

  const requestForUrl = (url: string, opts: Record<string, unknown> = {}): Request => {
    const env = MockRequest.envFor(`http://www.example.com${url}`, opts);
    return new Request(env);
  };

  it("to form params with hash", () => {
    expect(UrlHelper.toFormParams({ name: "David", nationality: "Danish" })).toEqual([
      { name: "name", value: "David" },
      { name: "nationality", value: "Danish" },
    ]);
  });

  it("to form params with hash having symbol and string keys", () => {
    expect(UrlHelper.toFormParams({ name: "David", nationality: "Danish" })).toEqual([
      { name: "name", value: "David" },
      { name: "nationality", value: "Danish" },
    ]);
  });

  it("to form params with nested hash", () => {
    expect(UrlHelper.toFormParams({ country: { name: "Denmark" } })).toEqual([
      { name: "country[name]", value: "Denmark" },
    ]);
  });

  it("to form params with array nested in hash", () => {
    expect(UrlHelper.toFormParams({ countries: ["Denmark", "Sweden"] })).toEqual([
      { name: "countries[]", value: "Denmark" },
      { name: "countries[]", value: "Sweden" },
    ]);
  });

  it("to form params with namespace", () => {
    expect(UrlHelper.toFormParams({ name: "Denmark" }, "country")).toEqual([
      { name: "country[name]", value: "Denmark" },
    ]);
  });

  it("button to without protect against forgery method", () => {
    delete view.isProtectAgainstForgery;
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com"),
    );
  });

  it("button to with authenticity token", () => {
    requestForgery = true;
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button><input name="form_token" type="hidden" value="token" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com", { authenticity_token: "token" }),
    );
  });

  it("button to with authenticity token true", () => {
    requestForgery = true;
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button><input name="form_token" type="hidden" value="secret" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com", { authenticity_token: true }),
    );
  });

  it("button to with authenticity token false", () => {
    requestForgery = true;
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { authenticity_token: false }),
    );
  });

  it("button to with straight url", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com"),
    );
  });

  it("button to with path", () => {
    const routed = UrlHelperView.withViewPaths([]) as any;
    assertDomEqual(
      `<form method="post" action="/article/Hello" class="button_to"><button type="submit">Hello</button></form>`,
      routed.buttonTo("Hello", routed.articlePath("Hello")),
    );
  });

  it("button to with false url", () => {
    assertDomEqual(
      `<form method="post" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", false),
    );
  });

  it("button to with straight url and request forgery", () => {
    requestForgery = true;
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button><input name="form_token" type="hidden" value="secret" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com"),
    );
  });

  it("button to with false url and block", () => {
    assertDomEqual(
      `<form method="post" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo(false, null, null, () => "Hello"),
    );
  });

  it("button to with new record model", () => {
    const session = new Session(null);

    assertDomEqual(
      `<form method="post" action="/sessions" class="button_to"><button type="submit">Create Session</button></form>`,
      view.buttonTo("Create Session", session),
    );
  });

  it("button to with new record model and block", () => {
    const workshop = new Workshop(null);

    assertDomEqual(
      `<form method="post" action="/workshops" class="button_to"><button type="submit">Create</button></form>`,
      view.buttonTo(workshop, null, null, () => "Create"),
    );
  });

  it("button to with nested new record model and block", () => {
    const workshop = new Workshop("1");
    const session = new Session(null);

    assertDomEqual(
      `<form method="post" action="/workshops/1/sessions" class="button_to"><button type="submit">Create</button></form>`,
      view.buttonTo([workshop, session], null, null, () => "Create"),
    );
  });

  it("button to with persisted model", () => {
    const workshop = new Workshop("1");

    assertDomEqual(
      `<form method="post" action="/workshops/1" class="button_to"><input type="hidden" name="_method" value="patch" autocomplete="off" /><button type="submit">Update</button></form>`,
      view.buttonTo(workshop, null, null, () => "Update"),
    );
  });

  it("button to with persisted model and block", () => {
    const workshop = new Workshop("1");

    assertDomEqual(
      `<form method="post" action="/workshops/1" class="button_to"><input type="hidden" name="_method" value="patch" autocomplete="off" /><button type="submit">Update</button></form>`,
      view.buttonTo(workshop, null, null, () => "Update"),
    );
  });

  it("button to with nested persisted model and block", () => {
    const workshop = new Workshop("1");
    const session = new Session("1");

    assertDomEqual(
      `<form method="post" action="/workshops/1/sessions/1" class="button_to"><input type="hidden" name="_method" value="patch" autocomplete="off" /><button type="submit">Update</button></form>`,
      view.buttonTo([workshop, session], null, null, () => "Update"),
    );
  });

  it("button to with form class", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="custom-class"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { form_class: "custom-class" }),
    );
  });

  it("button to with form class escapes", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="&lt;script&gt;evil_js&lt;/script&gt;"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { form_class: "<script>evil_js</script>" }),
    );
  });

  it("button to with query", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com/q1=v1&amp;q2=v2" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com/q1=v1&q2=v2"),
    );
  });

  it("button to with value", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit" name="key" value="value">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { name: "key", value: "value" }),
    );
  });

  it("button to with html safe URL", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com/q1=v1&amp;q2=v2" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", raw("http://www.example.com/q1=v1&amp;q2=v2")),
    );
  });

  it("button to with query and no name", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com?q1=v1&amp;q2=v2" class="button_to"><button type="submit">http://www.example.com?q1=v1&amp;q2=v2</button></form>`,
      view.buttonTo(null, "http://www.example.com?q1=v1&q2=v2"),
    );
  });

  it("button to with javascript confirm", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button data-confirm="Are you sure?" type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { data: { confirm: "Are you sure?" } }),
    );
  });

  it("button to with javascript disable with", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button data-disable-with="Greeting..." type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { data: { disable_with: "Greeting..." } }),
    );
  });

  it("button to with remote and form options", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="custom-class" data-remote="true" data-type="json"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", {
        remote: true,
        form: { class: "custom-class", "data-type": "json" },
      }),
    );
  });

  it("button to with remote and javascript confirm", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to" data-remote="true"><button data-confirm="Are you sure?" type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", {
        remote: true,
        data: { confirm: "Are you sure?" },
      }),
    );
  });

  it("button to with remote and javascript disable with", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to" data-remote="true"><button data-disable-with="Greeting..." type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", {
        remote: true,
        data: { disable_with: "Greeting..." },
      }),
    );
  });

  it("button to with remote false", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { remote: false }),
    );
  });

  it("button to enabled disabled", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { disabled: false }),
    );
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button disabled="disabled" type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { disabled: true }),
    );
  });

  it("button to with block and hash url", () => {
    assertDomEqual(
      `<form action="/other" class="button_to" method="post"><button class="button" type="submit">Hello</button></form>`,
      view.buttonTo(
        { controller: "foo", action: "other" },
        { class: "button" },
        null,
        () => "Hello",
      ),
    );
  });

  it("button to with content exfiltration prevention", () => {
    setPrependContentExfiltrationPrevention(true);
    try {
      assertDomEqual(
        `<!-- '"\` --><!-- </textarea></xmp> --></option></form><form method="post" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
        view.buttonTo("Hello", "http://www.example.com"),
      );
    } finally {
      setPrependContentExfiltrationPrevention(false);
    }
  });

  it("button to with method delete", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><input type="hidden" name="_method" value="delete" autocomplete="off" /><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { method: "delete" }),
    );
  });

  it("button to with method get", () => {
    assertDomEqual(
      `<form method="get" action="http://www.example.com" class="button_to"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", { method: "get" }),
    );
  });

  it("button to with block", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="button_to"><button type="submit"><span>Hello</span></button></form>`,
      view.buttonTo("http://www.example.com", null, null, () => view.contentTag("span", "Hello")),
    );
  });

  it("button to with params", () => {
    assertDomEqual(
      `<form action="http://www.example.com" class="button_to" method="post"><button type="submit">Hello</button><input type="hidden" name="baz" value="quux" autocomplete="off" /><input type="hidden" name="foo" value="bar" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com", { params: { foo: "bar", baz: "quux" } }),
    );
  });

  it("button to generates input when button to generates button tag false", () => {
    const oldValue = UrlHelper.buttonToGeneratesButtonTag;
    UrlHelper.setButtonToGeneratesButtonTag(false);
    try {
      assertDomEqual(
        `<form method="post" action="http://www.example.com" class="button_to"><input type="submit" value="Save"/></form>`,
        view.buttonTo("Save", "http://www.example.com"),
      );
    } finally {
      UrlHelper.setButtonToGeneratesButtonTag(oldValue);
    }
  });

  class FakeParams {
    #permitted: boolean;

    constructor(permitted = true) {
      this.#permitted = permitted;
    }

    isPermitted(): boolean {
      return this.#permitted;
    }

    toH(): Record<string, unknown> {
      if (this.isPermitted()) {
        return { foo: "bar", baz: "quux" };
      } else {
        throw new ArgumentError();
      }
    }
  }

  it("button to with permitted strong params", () => {
    assertDomEqual(
      `<form action="http://www.example.com" class="button_to" method="post"><button type="submit">Hello</button><input type="hidden" name="baz" value="quux" autocomplete="off" /><input type="hidden" name="foo" value="bar" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com", { params: new FakeParams() }),
    );
  });

  it("button to with unpermitted strong params", () => {
    expect(() =>
      view.buttonTo("Hello", "http://www.example.com", { params: new FakeParams(false) }),
    ).toThrow(ArgumentError);
  });

  it("button to with nested hash params", () => {
    assertDomEqual(
      `<form action="http://www.example.com" class="button_to" method="post"><button type="submit">Hello</button><input type="hidden" name="foo[bar]" value="baz" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com", { params: { foo: { bar: "baz" } } }),
    );
  });

  it("button to with nested array params", () => {
    assertDomEqual(
      `<form action="http://www.example.com" class="button_to" method="post"><button type="submit">Hello</button><input type="hidden" name="foo[]" value="bar" autocomplete="off" /></form>`,
      view.buttonTo("Hello", "http://www.example.com", { params: { foo: ["bar"] } }),
    );
  });

  it("link tag with straight url", () => {
    assertDomEqual(
      `<a href="http://www.example.com">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com"),
    );
  });

  it("link tag without host option", () => {
    const routed = UrlHelperView.withViewPaths([]) as any;
    assertDomEqual(`<a href="/">Test Link</a>`, routed.linkTo("Test Link", urlHash()));
  });

  it("link tag with host option", () => {
    const routed = UrlHelperView.withViewPaths([]) as any;
    const hash = hashFor({ host: "www.example.com" });
    const expected = `<a href="http://www.example.com/">Test Link</a>`;
    assertDomEqual(expected, routed.linkTo("Test Link", hash));
  });

  it("link tag with query", () => {
    const expected = `<a href="http://www.example.com?q1=v1&amp;q2=v2">Hello</a>`;
    assertDomEqual(expected, view.linkTo("Hello", "http://www.example.com?q1=v1&q2=v2"));
  });

  it("link tag with query and no name", () => {
    assertDomEqual(
      `<a href="http://www.example.com?q1=v1&amp;q2=v2">http://www.example.com?q1=v1&amp;q2=v2</a>`,
      view.linkTo(null, "http://www.example.com?q1=v1&q2=v2"),
    );
  });

  it("link tag with back", () => {
    const env = { HTTP_REFERER: "http://www.example.com/referer" };
    view = viewWith(controllerWithReferer(env));
    assertDomEqual(`<a href="${env.HTTP_REFERER}">go back</a>`, view.linkTo("go back", ":back"));
  });

  it("link tag with back and no referer", () => {
    view = viewWith(controllerWithReferer({}));
    const link = view.linkTo("go back", ":back");
    assertDomEqual(`<a href="javascript:history.back()">go back</a>`, link);
  });

  it("link tag with img", () => {
    const link = view.linkTo(raw("<img src='/favicon.jpg' />"), "/");
    const expected = `<a href="/"><img src='/favicon.jpg' /></a>`;
    assertDomEqual(expected, link);
  });

  it("link with nil html options", () => {
    const link = view.linkTo("Hello", urlHash(), null);
    assertDomEqual(`<a href="/">Hello</a>`, link);
  });

  it("link tag with custom onclick", () => {
    const link = view.linkTo("Hello", "http://www.example.com", { onclick: "alert('yay!')" });
    const expected = `<a href="http://www.example.com" onclick="alert(&#39;yay!&#39;)">Hello</a>`;
    assertDomEqual(expected, link);
  });

  it("link tag with javascript confirm", () => {
    assertDomEqual(
      `<a href="http://www.example.com" data-confirm="Are you sure?">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", { data: { confirm: "Are you sure?" } }),
    );
    assertDomEqual(
      `<a href="http://www.example.com" data-confirm="You can't possibly be sure, can you?">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", {
        data: { confirm: "You can't possibly be sure, can you?" },
      }),
    );
    assertDomEqual(
      `<a href="http://www.example.com" data-confirm="You can't possibly be sure,\n can you?">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", {
        data: { confirm: "You can't possibly be sure,\n can you?" },
      }),
    );
  });

  it("link to with remote", () => {
    assertDomEqual(
      `<a href="http://www.example.com" data-remote="true">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", { remote: true }),
    );
  });

  it("link to with remote false", () => {
    assertDomEqual(
      `<a href="http://www.example.com">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", { remote: false }),
    );
  });

  it("link to with symbolic remote in non html options", () => {
    assertDomEqual(
      `<a href="/" data-remote="true">Hello</a>`,
      view.linkTo("Hello", hashFor({ remote: true }), {}),
    );
  });

  it("link to with string remote in non html options", () => {
    assertDomEqual(
      `<a href="/" data-remote="true">Hello</a>`,
      view.linkTo("Hello", hashFor({ remote: true }), {}),
    );
  });

  it("link tag using post javascript", () => {
    assertDomEqual(
      `<a href="http://www.example.com" data-method="post" rel="nofollow">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", { method: "post" }),
    );
  });

  it("link tag using delete javascript", () => {
    assertDomEqual(
      `<a href="http://www.example.com" rel="nofollow" data-method="delete">Destroy</a>`,
      view.linkTo("Destroy", "http://www.example.com", { method: "delete" }),
    );
  });

  it("link tag using delete javascript and href", () => {
    assertDomEqual(
      `<a href="#" rel="nofollow" data-method="delete">Destroy</a>`,
      view.linkTo("Destroy", "http://www.example.com", { method: "delete", href: "#" }),
    );
  });

  it("link tag using post javascript and rel", () => {
    assertDomEqual(
      `<a href="http://www.example.com" data-method="post" rel="example nofollow">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", { method: "post", rel: "example" }),
    );

    assertDomEqual(
      `<a href="http://www.example.com" data-method="post" rel="example nofollow">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", { method: "post", rel: "example" }),
    );
  });

  it("link tag using post javascript and confirm", () => {
    assertDomEqual(
      `<a href="http://www.example.com" data-method="post" rel="nofollow" data-confirm="Are you serious?">Hello</a>`,
      view.linkTo("Hello", "http://www.example.com", {
        method: "post",
        data: { confirm: "Are you serious?" },
      }),
    );
  });

  it("link tag using delete javascript and href and confirm", () => {
    assertDomEqual(
      `<a href="#" rel="nofollow" data-confirm="Are you serious?" data-method="delete">Destroy</a>`,
      view.linkTo("Destroy", "http://www.example.com", {
        method: "delete",
        href: "#",
        data: { confirm: "Are you serious?" },
      }),
    );
  });

  it("link tag with block", () => {
    assertDomEqual(
      `<a href="/"><span>Example site</span></a>`,
      view.linkTo("/", null, null, () => view.contentTag("span", "Example site")),
    );
  });

  it("link tag with block and html options", () => {
    assertDomEqual(
      `<a class="special" href="/"><span>Example site</span></a>`,
      view.linkTo("/", { class: "special" }, null, () => view.contentTag("span", "Example site")),
    );
  });

  it("link tag using block and hash", () => {
    assertDomEqual(
      `<a href="/"><span>Example site</span></a>`,
      view.linkTo(urlHash(), null, null, () => view.contentTag("span", "Example site")),
    );
  });

  it("link tag using block in erb", () => {
    const out = renderTse(`<%= linkTo('/', null, null, () => { %>Example site<% }) %>`);
    expect(out).toBe('<a href="/">Example site</a>');
  });

  it("link tag with html safe string", () => {
    assertDomEqual(
      `<a href="/article/Gerd_M%C3%BCller">Gerd Müller</a>`,
      view.linkTo("Gerd Müller", view.articlePath("Gerd_Müller")),
    );
  });

  it("link tag escapes content", () => {
    assertDomEqual(
      `<a href="/">Malicious &lt;script&gt;content&lt;/script&gt;</a>`,
      view.linkTo("Malicious <script>content</script>", "/"),
    );
  });

  it("link tag does not escape html safe content", () => {
    assertDomEqual(
      `<a href="/">Malicious <script>content</script></a>`,
      view.linkTo(raw("Malicious <script>content</script>"), "/"),
    );
  });

  it("link tag using active record model", () => {
    const workshop = new Workshop((1).toString());
    const link = view.linkTo(workshop);
    assertDomEqual(`<a href="/workshops/1">Workshop 1</a>`, link);
  });

  it("link tag using active record model twice", () => {
    const workshop = new Workshop((1).toString());
    const link = view.linkTo(workshop, workshop);
    assertDomEqual(`<a href="/workshops/1">Workshop 1</a>`, link);
  });

  it("link to unless", () => {
    expect(String(view.linkToUnless(true, "Showing", urlHash()))).toBe("Showing");

    assertDomEqual(`<a href="/">Listing</a>`, view.linkToUnless(false, "Listing", urlHash()));

    expect(
      String(
        view.linkToUnless(true, "Showing", urlHash(), {}, (name: unknown) =>
          raw(`<strong>${name}</strong>`),
        ),
      ),
    ).toBe("<strong>Showing</strong>");

    expect(String(view.linkToUnless(true, "Showing", urlHash(), {}, () => "test"))).toBe("test");

    expect(String(view.linkToUnless(true, "<b>Showing</b>", urlHash()))).toBe(
      "&lt;b&gt;Showing&lt;/b&gt;",
    );
    expect(String(view.linkToUnless(false, "<b>Showing</b>", urlHash()))).toBe(
      `<a href="/">&lt;b&gt;Showing&lt;/b&gt;</a>`,
    );
    expect(String(view.linkToUnless(true, raw("<b>Showing</b>"), urlHash()))).toBe(
      "<b>Showing</b>",
    );
    expect(String(view.linkToUnless(false, raw("<b>Showing</b>"), urlHash()))).toBe(
      `<a href="/"><b>Showing</b></a>`,
    );
  });

  it("link to if", () => {
    expect(String(view.linkToIf(false, "Showing", urlHash()))).toBe("Showing");
    assertDomEqual(`<a href="/">Listing</a>`, view.linkToIf(true, "Listing", urlHash()));
  });

  it("link to if with block", () => {
    expect(String(view.linkToIf(false, "Showing", urlHash(), {}, () => "Fallback"))).toBe(
      "Fallback",
    );
    assertDomEqual(
      `<a href="/">Listing</a>`,
      view.linkToIf(true, "Listing", urlHash(), {}, () => "Fallback"),
    );
  });

  it("current page with http head method", () => {
    view.request = requestForUrl("/", { ":method": "head" });
    expect(view.isCurrentPage(urlHash())).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/")).toBeTruthy();
  });

  it("current page with simple url", () => {
    view.request = requestForUrl("/");
    expect(view.isCurrentPage(urlHash())).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/")).toBeTruthy();
  });

  it("current page ignoring params", () => {
    view.request = requestForUrl("/?order=desc&page=1");

    expect(view.isCurrentPage(urlHash())).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/")).toBeTruthy();
  });

  it("current page considering params", () => {
    view.request = requestForUrl("/?order=desc&page=1");

    expect(view.isCurrentPage(urlHash(), { checkParameters: true })).toBeFalsy();
    expect(view.isCurrentPage({ ...urlHash(), checkParameters: true })).toBeFalsy();
    expect(
      view.isCurrentPage(
        new ActionController.Parameters({ ...urlHash(), checkParameters: true }).permitBang(),
      ),
    ).toBeFalsy();
    expect(view.isCurrentPage("http://www.example.com/", { checkParameters: true })).toBeFalsy();
  });

  it("current page considering params when options does not respond to to hash", () => {
    view.request = requestForUrl("/?order=desc&page=1");

    expect(view.isCurrentPage(":back", { checkParameters: false })).toBeFalsy();
  });

  it("current page when options given as keyword arguments", () => {
    view.request = requestForUrl("/");

    expect(view.isCurrentPage(null, { ...urlHash() })).toBeTruthy();
  });

  it("current page with params that match", () => {
    view.request = requestForUrl("/?order=desc&page=1");

    expect(view.isCurrentPage(hashFor({ order: "desc", page: "1" }))).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/?order=desc&page=1")).toBeTruthy();
  });

  it("current page with scope that match", () => {
    view.request = requestForUrl("/engine/");

    expect(view.isCurrentPage("/engine")).toBeTruthy();
  });

  it("current page with escaped params", () => {
    view.request = requestForUrl("/category/administra%c3%a7%c3%a3o");

    expect(
      view.isCurrentPage({ controller: "foo", action: "category", category: "administração" }),
    ).toBeTruthy();
  });

  it("current page with escaped params with different encoding", () => {
    view.request = requestForUrl("/");
    Object.defineProperty(view.request, "path", { value: "/category/administra%c3%a7%c3%a3o" });
    expect(
      view.isCurrentPage({ controller: "foo", action: "category", category: "administração" }),
    ).toBeTruthy();
    expect(
      view.isCurrentPage("http://www.example.com/category/administra%c3%a7%c3%a3o"),
    ).toBeTruthy();
  });

  it("current page with double escaped params", () => {
    view.request = requestForUrl(
      "/category/administra%c3%a7%c3%a3o?callback_url=http%3a%2f%2fexample.com%2ffoo",
    );

    expect(
      view.isCurrentPage({
        controller: "foo",
        action: "category",
        category: "administração",
        callback_url: "http://example.com/foo",
      }),
    ).toBeTruthy();
  });

  it("current page with trailing slash", () => {
    view.request = requestForUrl("/posts");

    expect(view.isCurrentPage("/posts/")).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/posts/")).toBeTruthy();
  });

  it("current page with trailing slash and params", () => {
    view.request = requestForUrl("/posts?order=desc");
    expect(view.isCurrentPage("/posts/?order=desc")).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/posts/?order=desc")).toBeTruthy();
  });

  it("current page with not get verb", () => {
    view.request = requestForUrl("/events", { ":method": "post" });
    expect(view.isCurrentPage("/events")).toBeFalsy();
  });

  it("link unless current", () => {
    view.request = requestForUrl("/");

    expect(String(view.linkToUnlessCurrent("Showing", urlHash()))).toBe("Showing");
    expect(String(view.linkToUnlessCurrent("Showing", "http://www.example.com/"))).toBe("Showing");

    view.request = requestForUrl("/?order=desc");

    expect(String(view.linkToUnlessCurrent("Showing", urlHash()))).toBe("Showing");
    expect(String(view.linkToUnlessCurrent("Showing", "http://www.example.com/"))).toBe("Showing");

    view.request = requestForUrl("/?order=desc&page=1");

    expect(String(view.linkToUnlessCurrent("Showing", hashFor({ order: "desc", page: "1" })))).toBe(
      "Showing",
    );
    expect(
      String(view.linkToUnlessCurrent("Showing", "http://www.example.com/?order=desc&page=1")),
    ).toBe("Showing");

    view.request = requestForUrl("/?order=desc");

    expect(String(view.linkToUnlessCurrent("Showing", hashFor({ order: "asc" })))).toBe(
      `<a href="/?order=asc">Showing</a>`,
    );
    expect(String(view.linkToUnlessCurrent("Showing", "http://www.example.com/?order=asc"))).toBe(
      `<a href="http://www.example.com/?order=asc">Showing</a>`,
    );

    view.request = requestForUrl("/?order=desc");
    expect(String(view.linkToUnlessCurrent("Showing", hashFor({ order: "desc", page: 2 })))).toBe(
      `<a href="/?order=desc&amp;page=2">Showing</a>`,
    );
    expect(
      String(view.linkToUnlessCurrent("Showing", "http://www.example.com/?order=desc&page=2")),
    ).toBe(`<a href="http://www.example.com/?order=desc&amp;page=2">Showing</a>`);

    view.request = requestForUrl("/show");

    expect(String(view.linkToUnlessCurrent("Listing", urlHash()))).toBe(`<a href="/">Listing</a>`);
    expect(String(view.linkToUnlessCurrent("Listing", "http://www.example.com/"))).toBe(
      `<a href="http://www.example.com/">Listing</a>`,
    );
  });

  it("link to unless with block", () => {
    assertDomEqual(
      `<a href="/">Showing</a>`,
      view.linkToUnless(false, "Showing", urlHash(), {}, () => "Fallback"),
    );
    expect(String(view.linkToUnless(true, "Listing", urlHash(), {}, () => "Fallback"))).toBe(
      "Fallback",
    );
  });

  it("mail to", () => {
    assertDomEqual(
      `<a href="mailto:david@loudthinking.com">david@loudthinking.com</a>`,
      view.mailTo("david@loudthinking.com"),
    );
    assertDomEqual(
      `<a href="mailto:david@loudthinking.com">David Heinemeier Hansson</a>`,
      view.mailTo("david@loudthinking.com", "David Heinemeier Hansson"),
    );
    assertDomEqual(
      `<a class="admin" href="mailto:david@loudthinking.com">David Heinemeier Hansson</a>`,
      view.mailTo("david@loudthinking.com", "David Heinemeier Hansson", { class: "admin" }),
    );
    expect(
      String(view.mailTo("david@loudthinking.com", "David Heinemeier Hansson", { class: "admin" })),
    ).toBe(`<a class="admin" href="mailto:david@loudthinking.com">David Heinemeier Hansson</a>`);
  });

  it("mail to with options", () => {
    const opts = {
      cc: "ccaddress@example.com",
      bcc: "bccaddress@example.com",
      subject: "This is an example email",
      body: "This is the body of the message.",
      reply_to: "foo@bar.com",
    };
    const query =
      "cc=ccaddress%40example.com&amp;bcc=bccaddress%40example.com&amp;body=This%20is%20the%20body%20of%20the%20message.&amp;subject=This%20is%20an%20example%20email&amp;reply-to=foo%40bar.com";
    assertDomEqual(
      `<a href="mailto:me@example.com?${query}">My email</a>`,
      view.mailTo("me@example.com", "My email", { ...opts }),
    );
    assertDomEqual(
      `<a href="mailto:me@example.com?${query}">me@example.com</a>`,
      view.mailTo("me@example.com", { ...opts }),
    );
    assertDomEqual(
      `<a href="mailto:me@example.com?body=This%20is%20the%20body%20of%20the%20message.&amp;subject=This%20is%20an%20example%20email">My email</a>`,
      view.mailTo("me@example.com", "My email", {
        cc: "",
        bcc: "",
        subject: opts.subject,
        body: opts.body,
      }),
    );
  });

  it("mail to with special characters", () => {
    assertDomEqual(
      `<a href="mailto:%23%21%24%25%26%27%2A%2B-%2F%3D%3F%5E_%60%7B%7D%7C@example.org">#!$%&amp;&#39;*+-/=?^_\`{}|@example.org</a>`,
      view.mailTo("#!$%&'*+-/=?^_`{}|@example.org"),
    );
  });

  it("mail to with img", () => {
    assertDomEqual(
      `<a href="mailto:feedback@example.com"><img src="/feedback.png" /></a>`,
      view.mailTo("feedback@example.com", raw('<img src="/feedback.png" />')),
    );
  });

  it("mail to with html safe string", () => {
    assertDomEqual(
      `<a href="mailto:david@loudthinking.com">david@loudthinking.com</a>`,
      view.mailTo(raw("david@loudthinking.com")),
    );
  });

  it("mail to with nil", () => {
    assertDomEqual(`<a href="mailto:"></a>`, view.mailTo(null));
  });

  it("mail to returns html safe string", () => {
    assertPredicate(view.mailTo("david@loudthinking.com"), isHtmlSafe);
  });

  it("mail to with block", () => {
    assertDomEqual(
      `<a href="mailto:me@example.com"><span>Email me</span></a>`,
      view.mailTo("me@example.com", null, {}, () => view.contentTag("span", "Email me")),
    );
  });

  it("mail to with block and options", () => {
    assertDomEqual(
      `<a class="special" href="mailto:me@example.com?cc=ccaddress%40example.com"><span>Email me</span></a>`,
      view.mailTo("me@example.com", { cc: "ccaddress@example.com", class: "special" }, null, () =>
        view.contentTag("span", "Email me"),
      ),
    );
  });

  it("mail to does not modify html options hash", () => {
    const options = { class: "special" };
    view.mailTo("me@example.com", "ME!", options);
    expect(options).toEqual({ class: "special" });
  });

  it("sms to", () => {
    assertDomEqual(`<a href="sms:15155555785;">15155555785</a>`, view.smsTo("15155555785"));
    assertDomEqual(
      `<a href="sms:15155555785;">Jim Jones</a>`,
      view.smsTo("15155555785", "Jim Jones"),
    );
    assertDomEqual(
      `<a class="admin" href="sms:15155555785;">Jim Jones</a>`,
      view.smsTo("15155555785", "Jim Jones", { class: "admin" }),
    );
    expect(String(view.smsTo("15155555785", "Jim Jones", { class: "admin" }))).toBe(
      `<a class="admin" href="sms:15155555785;">Jim Jones</a>`,
    );
  });

  it("sms to with options", () => {
    const opts = { class: "simple-class", country_code: "01", body: "Hello from Jim" };
    const href = "sms:+015155555785;?&body=Hello%20from%20Jim";
    assertDomEqual(
      `<a class="simple-class" href="${href}">Text me</a>`,
      view.smsTo("5155555785", "Text me", { ...opts }),
    );
    assertDomEqual(
      `<a class="simple-class" href="${href}">5155555785</a>`,
      view.smsTo("5155555785", { ...opts }),
    );
    assertDomEqual(
      `<a href="sms:5155555785;?&body=This%20is%20the%20body%20of%20the%20message.">Text me</a>`,
      view.smsTo("5155555785", "Text me", { body: "This is the body of the message." }),
    );
  });

  it("sms to with img", () => {
    assertDomEqual(
      `<a href="sms:15155555785;"><img src="/feedback.png" /></a>`,
      view.smsTo("15155555785", raw('<img src="/feedback.png" />')),
    );
  });

  it("sms to with html safe string", () => {
    assertDomEqual(
      `<a href="sms:1%2B5155555785;">1+5155555785</a>`,
      view.smsTo(raw("1+5155555785")),
    );
  });

  it("sms to with nil", () => {
    assertDomEqual(`<a href="sms:;"></a>`, view.smsTo(null));
  });

  it("sms to returns html safe string", () => {
    assertPredicate(view.smsTo("15155555785"), isHtmlSafe);
  });

  it("sms to with block", () => {
    assertDomEqual(
      `<a href="sms:15155555785;"><span>Text me</span></a>`,
      view.smsTo("15155555785", null, {}, () => view.contentTag("span", "Text me")),
    );
  });

  it("sms to with block and options", () => {
    assertDomEqual(
      `<a class="special" href="sms:15155555785;?&body=Hello%20from%20Jim"><span>Text me</span></a>`,
      view.smsTo("15155555785", { body: "Hello from Jim", class: "special" }, null, () =>
        view.contentTag("span", "Text me"),
      ),
    );
  });

  it("sms to does not modify html options hash", () => {
    const options = { class: "special" };
    view.smsTo("15155555785", "ME!", options);
    expect(options).toEqual({ class: "special" });
  });

  it("phone to", () => {
    assertDomEqual(`<a href="tel:1234567890">1234567890</a>`, view.phoneTo("1234567890"));
    assertDomEqual(`<a href="tel:1234567890">Bob</a>`, view.phoneTo("1234567890", "Bob"));
    assertDomEqual(
      `<a class="phoner" href="tel:1234567890">Bob</a>`,
      view.phoneTo("1234567890", "Bob", { class: "phoner" }),
    );
    expect(String(view.phoneTo("1234567890", "Bob", { class: "admin" }))).toBe(
      `<a class="admin" href="tel:1234567890">Bob</a>`,
    );
  });

  it("phone to with options", () => {
    const opts = { class: "example-class", country_code: "01" };
    assertDomEqual(
      `<a class="example-class" href="tel:+011234567890">Phone</a>`,
      view.phoneTo("1234567890", "Phone", { ...opts }),
    );
    assertDomEqual(
      `<a class="example-class" href="tel:+011234567890">1234567890</a>`,
      view.phoneTo("1234567890", { ...opts }),
    );
    assertDomEqual(
      `<a href="tel:+011234567890">Phone</a>`,
      view.phoneTo("1234567890", "Phone", { country_code: "01" }),
    );
  });

  it("phone to with img", () => {
    assertDomEqual(
      `<a href="tel:1234567890"><img src="/feedback.png" /></a>`,
      view.phoneTo("1234567890", raw('<img src="/feedback.png" />')),
    );
  });

  it("phone to with html safe string", () => {
    assertDomEqual(`<a href="tel:1%2B234567890">1+234567890</a>`, view.phoneTo(raw("1+234567890")));
  });

  it("phone to with nil", () => {
    assertDomEqual(`<a href="tel:"></a>`, view.phoneTo(null));
  });

  it("phone to returns html safe string", () => {
    assertPredicate(view.phoneTo("1234567890"), isHtmlSafe);
  });

  it("phone to with block", () => {
    assertDomEqual(
      `<a href="tel:1234567890"><span>Phone</span></a>`,
      view.phoneTo("1234567890", null, {}, () => view.contentTag("span", "Phone")),
    );
  });

  it("phone to with block and options", () => {
    assertDomEqual(
      `<a class="special" href="tel:+011234567890"><span>Phone</span></a>`,
      view.phoneTo("1234567890", { country_code: "01", class: "special" }, null, () =>
        view.contentTag("span", "Phone"),
      ),
    );
  });

  it("phone to does not modify html options hash", () => {
    const options = { class: "special" };
    view.phoneTo("1234567890", "ME!", options);
    expect(options).toEqual({ class: "special" });
  });
});
