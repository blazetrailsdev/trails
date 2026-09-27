/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { setPrependContentExfiltrationPrevention } from "../helpers/content-exfiltration-prevention-helper.js";
import * as UrlHelper from "../helpers/url-helper.js";

function viewWith(controller: unknown): Base {
  return Base.withViewPaths([], {}, controller);
}

const normalizeDom = (html: unknown): string =>
  String(html)
    .replaceAll("&amp;", "&")
    .replace(/<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>/g, (_m, name, attrs, close) => {
      const sorted = (attrs.match(/[\w-]+="[^"]*"/g) ?? []).sort().join(" ");
      return `<${name}${sorted ? " " + sorted : ""}${close}>`;
    });

const assertDomEqual = (expected: string, actual: unknown): void => {
  expect(normalizeDom(actual)).toEqual(normalizeDom(expected));
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

  it("url for with invalid referer", () => {
    const referer = "THIS IS NOT A URL";
    const view = viewWith(controllerWithReferer({ HTTP_REFERER: referer }));
    expect(view.urlFor(":back")).toBe("javascript:history.back()");
  });

  let requestForgery = false;
  let view: any;

  beforeEach(() => {
    view = viewWith(null);
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

  const requestForUrl = (url: string, { method = "get" } = {}) => ({
    isGet: () => method === "get",
    isHead: () => method === "head",
    path: url.split("?")[0],
    fullpath: url,
    protocol: "http://",
    hostWithPort: "www.example.com",
  });

  it("to form params with hash", () => {
    expect(UrlHelper.toFormParams({ name: "David", nationality: "Danish" })).toEqual([
      { name: "name", value: "David" },
      { name: "nationality", value: "Danish" },
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

  it("button to with remote and form options", () => {
    assertDomEqual(
      `<form method="post" action="http://www.example.com" class="custom-class" data-remote="true" data-type="json"><button type="submit">Hello</button></form>`,
      view.buttonTo("Hello", "http://www.example.com", {
        remote: true,
        form: { class: "custom-class", "data-type": "json" },
      }),
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

  it("link tag with block and html options", () => {
    assertDomEqual(
      `<a class="special" href="/"><span>Example site</span></a>`,
      view.linkTo("/", { class: "special" }, null, () => view.contentTag("span", "Example site")),
    );
  });

  it("current page with trailing slash and params", () => {
    view.request = requestForUrl("/posts?order=desc");
    expect(view.isCurrentPage("/posts/?order=desc")).toBeTruthy();
    expect(view.isCurrentPage("http://www.example.com/posts/?order=desc")).toBeTruthy();
  });

  it("current page with not get verb", () => {
    view.request = requestForUrl("/events", { method: "post" });
    expect(view.isCurrentPage("/events")).toBeFalsy();
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
});
