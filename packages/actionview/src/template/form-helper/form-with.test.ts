import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet, UrlFor } from "@blazetrails/actionpack";
import { Conversion, Naming } from "@blazetrails/activemodel";
import { I18n, extend, isPresent, registerConstant } from "@blazetrails/activesupport";
import { ArgumentError, include } from "@blazetrails/ruby-compat";

import { Base } from "../../base.js";
import { LookupContext } from "../../lookup-context.js";
import { formWithGeneratesIds, setFormWithGeneratesIds } from "../../helpers/form-helper.js";
import { defaultEnforceUtf8, setDefaultEnforceUtf8 } from "../../helpers/form-tag-helper.js";
import { urlFor } from "../../helpers/url-helper.js";
import { RoutingUrlFor } from "../../routing-url-for.js";
import type { FormBuilder } from "../../helpers/form-helper.js";

function normalizeDom(html: string): string {
  return html
    .replace(/<\/form>$/, "")
    .replace(/<([a-z]+)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g, (_m, name, attrs) => {
      const list = (attrs.match(/[^\s=]+(?:=(?:"[^"]*"|'[^']*'))?/g) ?? []).map((a: string) =>
        a.replace(/='([^']*)'$/, '="$1"'),
      );
      return `<${name} ${list.sort().join(" ")}>`;
    });
}

function assertDomEqual(expected: string, actual: unknown): void {
  expect(normalizeDom(String(actual))).toBe(normalizeDom(expected));
}

function withDefaultEnforceUtf8(value: boolean, block: () => void): void {
  const oldValue = defaultEnforceUtf8;
  setDefaultEnforceUtf8(value);
  try {
    block();
  } finally {
    setDefaultEnforceUtf8(oldValue);
  }
}

function buildView(): Base {
  const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
  view.urlFor = function (this: Base, options: unknown): string {
    if (options != null && typeof options === "object" && !Array.isArray(options)) {
      return "http://www.example.com";
    }
    return urlFor.call(this, options);
  } as typeof view.urlFor;
  return view;
}

let oldValue: boolean;
beforeEach(() => {
  oldValue = formWithGeneratesIds;
  setFormWithGeneratesIds(true);
});
afterEach(() => {
  setFormWithGeneratesIds(oldValue);
});

describe("FormWithActsLikeFormTagTest", () => {
  let view: Base;
  beforeEach(() => {
    view = buildView();
  });

  function hiddenFields(options: { method?: string; skipEnforcingUtf8?: boolean } = {}): string {
    const method = options.method;
    const skipEnforcingUtf8 = options.skipEnforcingUtf8 ?? false;
    let txt = "";
    if (!skipEnforcingUtf8) {
      txt += `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;
    }
    if (method && !["get", "post"].includes(method)) {
      txt += `<input name="_method" type="hidden" value="${method}" autocomplete="off" />`;
    }
    return txt;
  }

  function formText(
    action: string | false = "http://www.example.com",
    {
      local = false,
      ...options
    }: {
      local?: boolean;
      enctype?: boolean;
      htmlClass?: string;
      id?: string;
      method?: string;
    } = {},
  ): string {
    const { enctype, htmlClass, id } = options;
    const method = options.method === "get" ? "get" : "post";
    let txt = `<form accept-charset="UTF-8"` + (action ? ` action="${action}"` : "");
    if (enctype) txt += ` enctype="multipart/form-data"`;
    if (!local) txt += ` data-remote="true"`;
    if (htmlClass) txt += ` class="${htmlClass}"`;
    if (id) txt += ` id="${id}"`;
    return txt + ` method="${method}">`;
  }

  function wholeForm(
    action: string | false = "http://www.example.com",
    options: {
      local?: boolean;
      enctype?: boolean;
      method?: string;
      skipEnforcingUtf8?: boolean;
    } = {},
    block?: () => string,
  ): string {
    let out = formText(action, options) + hiddenFields(options);
    if (block) out += block() + "</form>";
    return out;
  }

  it("form with multipart", () => {
    const actual = view.formWith({ multipart: true });
    const expected = wholeForm("http://www.example.com", { enctype: true });
    assertDomEqual(expected, actual);
  });

  it("form with with method patch", () => {
    const actual = view.formWith({ method: "patch" });
    const expected = wholeForm("http://www.example.com", { method: "patch" });
    assertDomEqual(expected, actual);
  });

  it("form with with method put", () => {
    const actual = view.formWith({ method: "put" });
    const expected = wholeForm("http://www.example.com", { method: "put" });
    assertDomEqual(expected, actual);
  });

  it("form with with method delete", () => {
    const actual = view.formWith({ method: "delete" });
    const expected = wholeForm("http://www.example.com", { method: "delete" });
    assertDomEqual(expected, actual);
  });

  it("form with false url", () => {
    const actual = view.formWith({ url: false });
    const expected = wholeForm(false);
    assertDomEqual(expected, actual);
  });

  it("form with false action", () => {
    const actual = view.formWith({ html: { action: false } });
    const expected = wholeForm(false);
    assertDomEqual(expected, actual);
  });

  it("form with with local true", () => {
    const actual = view.formWith({ local: true });
    const expected = wholeForm("http://www.example.com", { local: true });
    assertDomEqual(expected, actual);
  });

  it("form with skip enforcing utf8 true", () => {
    const actual = view.formWith({ skipEnforcingUtf8: true });
    const expected = wholeForm("http://www.example.com", { skipEnforcingUtf8: true });
    assertDomEqual(expected, actual);
    expect(actual.htmlSafe).toBeTruthy();
  });

  it("form with default enforce utf8 false", () => {
    withDefaultEnforceUtf8(false, () => {
      const actual = view.formWith();
      const expected = wholeForm("http://www.example.com", { skipEnforcingUtf8: true });
      assertDomEqual(expected, actual);
      expect(actual.htmlSafe).toBeTruthy();
    });
  });

  it("form with default enforce utf8 true", () => {
    withDefaultEnforceUtf8(true, () => {
      const actual = view.formWith();
      const expected = wholeForm("http://www.example.com", { skipEnforcingUtf8: false });
      assertDomEqual(expected, actual);
      expect(actual.htmlSafe).toBeTruthy();
    });
  });

  it("form with with block in tse", () => {
    const rendered = view.render({
      inline: "<%= formWith({ url: 'http://www.example.com' }, () => { %>Hello world!<% }) %>",
    });
    const expected = wholeForm("http://www.example.com", {}, () => "Hello world!");
    assertDomEqual(expected, rendered);
  });
});

class Post {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  persisted = false;
  title: string | null = null;

  isPersisted(): boolean {
    return this.persisted;
  }
}

class BlogPost {
  static moduleName = "Blog";
  static {
    Object.defineProperty(this, "name", { value: "Post" });
    extend(this, Naming);
    include(this, Conversion);
  }

  constructor(
    public title: string,
    public id: unknown,
  ) {}

  isPersisted(): boolean {
    return isPresent(this.id);
  }
}

registerConstant("Blog", { name: "Blog", useRelativeModelNaming: () => true, Post: BlogPost });

include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);

const Routes = new RouteSet();
Routes.draw((r) => {
  r.resources("posts", (r) => {
    r.resources("comments");
  });
});

describe("FormWithActsLikeFormForTest", () => {
  let view: Base;
  let rendered: unknown;

  function formWith(...args: Parameters<Base["formWith"]>): unknown {
    return (rendered = view.formWith(...args));
  }

  beforeEach(() => {
    view = buildView();
    const urlFor = view.urlFor;
    view.urlFor = function (this: Base, options: unknown): string {
      if (options != null && typeof options === "object" && !Array.isArray(options)) return "/";
      return urlFor.call(this, options);
    } as typeof view.urlFor;
    include(view.constructor as new (...args: never[]) => unknown, Routes.urlHelpers());

    I18n.backend().storeTranslations("submit", {
      helpers: {
        submit: {
          create: "Create %{model}",
          update: "Confirm %{model} changes",
          submit: "Save changes",
          another_post: {
            update: "Update your %{model}",
          },
          "blog/post": {
            update: "Update your %{model}",
          },
        },
      },
    });

    const post = new Post();
    Object.assign(post, { toKey: () => [123], id: 0, toParam: () => "123" });
    post.persisted = true;
    post.title = "Hello World";
    (view as unknown as { post: Post }).post = post;
  });

  afterEach(() => {
    I18n.reloadBang();
  });

  const titleField = "<input name='post[title]' type='text' value='Hello World' id='post_title' />";

  function concat(string: unknown): unknown {
    return (view as unknown as { concat(string: unknown): unknown }).concat(string);
  }

  function contentTag(name: string, content: unknown): unknown {
    return view.contentTag(name, content);
  }

  function tag(): { span(content: unknown, options: Record<string, unknown>): unknown } {
    return view.tag() as unknown as ReturnType<typeof tag>;
  }

  function post(): Post {
    return (view as unknown as { post: Post }).post;
  }

  function wholeForm(
    action: string | false = "/",
    id: string | null = null,
    htmlClass: string | null = null,
    options: { local?: boolean; method?: string; skipEnforcingUtf8?: boolean } = {},
    block?: () => string,
  ): string {
    const { local = false, method, skipEnforcingUtf8 = false } = options;
    let txt = `<form accept-charset="UTF-8"` + (action ? ` action="${action}"` : "");
    if (!local) txt += ` data-remote="true"`;
    if (htmlClass) txt += ` class="${htmlClass}"`;
    if (id) txt += ` id="${id}"`;
    txt += ` method="${method === "get" ? "get" : "post"}">`;
    if (!skipEnforcingUtf8) {
      txt += `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;
    }
    if (method && !["get", "post"].includes(method)) {
      txt += `<input name="_method" type="hidden" value="${method}" autocomplete="off" />`;
    }
    return txt + (block ? block() : "") + "</form>";
  }

  it("form with when given nil model argument", () => {
    expect(() => formWith({ model: null }, () => {})).toThrow(ArgumentError);
  });

  it("form with false url", () => {
    formWith({ url: false });
    assertDomEqual(wholeForm(false), rendered);
  });

  it("form with model and false url", () => {
    formWith({ model: new Post(), url: false });
    assertDomEqual(wholeForm(false), rendered);
  });

  it("form with only url on create", () => {
    formWith({ url: "/posts" }, (f) => {
      concat(f.label("title", "Label me"));
      concat(f.textField("title"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () => '<label for="title">Label me</label>' + '<input type="text" name="title" id="title">',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with only url on update", () => {
    formWith({ url: "/posts/123" }, (f) => {
      concat(f.label("title", "Label me"));
      concat(f.textField("title"));
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      {},
      () => '<label for="title">Label me</label>' + '<input type="text" name="title" id="title">',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with general attributes", () => {
    formWith({ url: "/posts/123" }, (f) => concat(f.textField("no_model_to_back_this_badboy")));

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      {},
      () =>
        '<input type="text" name="no_model_to_back_this_badboy" id="no_model_to_back_this_badboy" >',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with attribute not on model", () => {
    formWith({ model: post() }, (f) => concat(f.textField("this_dont_exist_on_post")));

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input type="text" name="post[this_dont_exist_on_post]" id="post_this_dont_exist_on_post" >',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with search field", () => {
    formWith({ model: new Post(), url: "/search", id: "search-post", method: "get" }, (f) =>
      concat(f.searchField("title")),
    );

    const expected = wholeForm(
      "/search",
      "search-post",
      null,
      { method: "get" },
      () => "<input name='post[title]' type='search' id='post_title' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with skip enforcing utf8 true", () => {
    formWith({ scope: "post", skipEnforcingUtf8: true }, (f) => concat(f.textField("title")));

    const expected = wholeForm("/", null, null, { skipEnforcingUtf8: true }, () => titleField);

    assertDomEqual(expected, rendered);
  });

  it("form with skip enforcing utf8 false", () => {
    formWith({ scope: "post", skipEnforcingUtf8: false }, (f) => concat(f.textField("title")));

    const expected = wholeForm("/", null, null, { skipEnforcingUtf8: false }, () => titleField);

    assertDomEqual(expected, rendered);
  });

  it("form with default enforce utf8 true", () => {
    withDefaultEnforceUtf8(true, () => {
      formWith({ scope: "post" }, (f) => concat(f.textField("title")));

      const expected = wholeForm("/", null, null, { skipEnforcingUtf8: false }, () => titleField);

      assertDomEqual(expected, rendered);
    });
  });

  it("form with default enforce utf8 false", () => {
    withDefaultEnforceUtf8(false, () => {
      formWith({ scope: "post" }, (f) => concat(f.textField("title")));

      const expected = wholeForm("/", null, null, { skipEnforcingUtf8: true }, () => titleField);

      assertDomEqual(expected, rendered);
    });
  });
  it("form with label passes translation to block version", () => {
    formWith({ model: new Post() }, (f) => {
      concat(
        f.label("title", null, {}, (label) => {
          concat(contentTag("span", label));
        }),
      );
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () => `<label for="post_title"><span>Title</span></label>`,
    );

    assertDomEqual(expected, rendered);
  });

  it("form with label passes label tag builder to block version", () => {
    formWith({ model: new Post() }, (f) => {
      concat(
        f.label("title", null, {}, (builder) => {
          concat(contentTag("span", builder.translation()));
        }),
      );
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () => `<label for="post_title"><span>Title</span></label>`,
    );

    assertDomEqual(expected, rendered);
  });

  it("form with label accesses object through label tag builder", () => {
    formWith({ model: new Post() }, (f) => {
      concat(
        f.label("title", null, {}, (builder) => {
          concat(
            tag().span(builder, {
              class: !(builder.object as Post).isPersisted() ? "new_record" : null,
            }),
          );
        }),
      );
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () => `<label for="post_title"><span class="new_record">Title</span></label>`,
    );

    assertDomEqual(expected, rendered);
  });

  it("submit with object as new record and locale strings", () => {
    I18n.withLocale("submit", () => {
      post().persisted = false;
      Object.assign(post(), { toKey: () => null });
      formWith({ model: post() }, (f: FormBuilder) => concat(f.submit()));

      const expected = wholeForm(
        "/posts",
        null,
        null,
        {},
        () =>
          "<input name='commit' data-disable-with='Create Post' type='submit' value='Create Post' />",
      );

      assertDomEqual(expected, rendered);
    });
  });

  it("submit with object as existing record and locale strings", () => {
    I18n.withLocale("submit", () => {
      formWith({ model: post() }, (f: FormBuilder) => concat(f.submit()));

      const expected = wholeForm(
        "/posts/123",
        null,
        null,
        { method: "patch" },
        () =>
          "<input name='commit' data-disable-with='Confirm Post changes' type='submit' value='Confirm Post changes' />",
      );

      assertDomEqual(expected, rendered);
    });
  });

  it("submit without object and locale strings", () => {
    I18n.withLocale("submit", () => {
      formWith({ scope: "post" }, (f: FormBuilder) => concat(f.submit({ class: "extra" })));

      const expected = wholeForm(
        undefined,
        null,
        null,
        {},
        () =>
          "<input name='commit' class='extra' data-disable-with='Save changes' type='submit' value='Save changes' />",
      );

      assertDomEqual(expected, rendered);
    });
  });

  it("submit with object which is overwritten by scope option", () => {
    I18n.withLocale("submit", () => {
      formWith({ model: post(), scope: "another_post" }, (f: FormBuilder) => concat(f.submit()));

      const expected = wholeForm(
        "/posts/123",
        null,
        null,
        { method: "patch" },
        () =>
          "<input name='commit' data-disable-with='Update your Post' type='submit' value='Update your Post' />",
      );

      assertDomEqual(expected, rendered);
    });
  });

  it("submit with object which is namespaced", () => {
    const blogPost = new BlogPost("And his name will be forty and four.", 44);
    I18n.withLocale("submit", () => {
      formWith({ model: blogPost }, (f: FormBuilder) => concat(f.submit()));

      const expected = wholeForm(
        "/posts/44",
        null,
        null,
        { method: "patch" },
        () =>
          "<input name='commit' data-disable-with='Update your Post' type='submit' value='Update your Post' />",
      );

      assertDomEqual(expected, rendered);
    });
  });
});
