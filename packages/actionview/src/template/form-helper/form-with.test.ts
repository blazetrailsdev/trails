import "../../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet } from "@blazetrails/actionpack";
import { Conversion, Naming } from "@blazetrails/activemodel";
import {
  I18n,
  assertEqual,
  assertMatch,
  assertNotIncludes,
  extend,
  isPlainObject,
  isPresent,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  include,
  rbModConstSet,
  publicInstanceMethods,
  registerConstant,
} from "@blazetrails/ruby-compat";

import { Base } from "../../base.js";
import { LookupContext } from "../../lookup-context.js";
import { formWithGeneratesIds, setFormWithGeneratesIds } from "../../helpers/form-helper.js";
import { defaultEnforceUtf8, setDefaultEnforceUtf8 } from "../../helpers/form-tag-helper.js";
import { urlFor } from "../../helpers/url-helper.js";
import { FormBuilder as FormBuilderClass, type FormBuilder } from "../../helpers/form-helper.js";
import { assertDomEqual } from "../../testing/dom-assertions.js";

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

  it("form with with block in tse", async () => {
    const rendered = await view.render({
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
  body: string | null = null;
  secret: unknown = null;
  comments: Comment[] = [];

  get ["secret?"](): unknown {
    return this.secret;
  }

  isPersisted(): boolean {
    return this.persisted;
  }
}

class Comment {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  constructor(
    public id: unknown = null,
    public post_id: unknown = null,
  ) {}

  toKey(): unknown[] | null {
    return this.id != null && this.id !== false ? [this.id] : null;
  }

  save(): void {
    this.id = 1;
    this.post_id = 1;
  }

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  toParam(): unknown {
    return this.id != null && this.id !== false ? String(this.id) : this.id;
  }

  get name(): string {
    return this.id == null ? "new comment" : `comment #${String(this.id)}`;
  }
}

const Blog = { name: "Blog", isUseRelativeModelNaming: () => true };
registerConstant("Blog", Blog);

class BlogPost {
  static {
    rbModConstSet(Blog, "Post", this);
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

const Routes = new RouteSet();
Routes.draw(function () {
  this.resources("posts", () => {
    this.resources("comments");
  });

  this.namespace("admin", () => {
    this.resources("posts", () => {
      this.resources("comments");
    });
  });
});

describe("FormWithActsLikeFormForTest", () => {
  let view: Base;
  let rendered: unknown;
  let urlForOptions: Record<string, unknown>;
  let comment: Comment;

  function formWith(...args: Parameters<Base["formWith"]>): unknown {
    return (rendered = view.formWith(...args));
  }

  beforeEach(() => {
    view = buildView();
    view.urlFor = function (this: Base, options: unknown): string {
      if (isPlainObject(options)) {
        urlForOptions = options as Record<string, unknown>;
        return "/";
      }
      return (Object.getPrototypeOf(this) as Base).urlFor.call(this, options);
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
    post.body = "Back to the hill and over it again!";
    post.secret = 1;
    comment = new Comment();
    post.comments = [comment];
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
    options: {
      local?: boolean;
      method?: string;
      multipart?: string;
      skipEnforcingUtf8?: boolean;
    } = {},
    block?: () => string,
  ): string {
    const { local = false, method, multipart, skipEnforcingUtf8 = false } = options;
    let txt = `<form accept-charset="UTF-8"` + (action ? ` action="${action}"` : "");
    if (multipart) txt += ` enctype="multipart/form-data"`;
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

  it("fields with attributes not on model", () => {
    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comment", {}, (c) => {
          concat(c.textField("dont_exist_on_model"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input type="text" name="post[comment][dont_exist_on_model]" id="post_comment_dont_exist_on_model" >',
    );

    assertDomEqual(expected, rendered);
  });

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

  function fields(...args: Parameters<Base["fields"]>): unknown {
    return view.fields(...args);
  }

  function helpers(): Record<string, (...args: unknown[]) => string> {
    return view as unknown as Record<string, (...args: unknown[]) => string>;
  }

  const postFields =
    "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
    "<input name='post[secret]' type='hidden' value='0' autocomplete='off' />" +
    "<input name='post[secret]' checked='checked' type='checkbox' value='1' id='post_secret' />";

  it("fields", () => {
    rendered = fields("post", { model: post() }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[title]' type='text' value='Hello World' id='post_title' />" + postFields;

    assertDomEqual(expected, rendered);
  });

  it("fields with index", () => {
    rendered = fields("post[]", { model: post() }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[123][title]' type='text' value='Hello World' id='post_123_title' />" +
      "<textarea name='post[123][body]' id='post_123_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[123][secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[123][secret]' checked='checked' type='checkbox' value='1' id='post_123_secret' />";

    assertDomEqual(expected, rendered);
  });

  it("fields with nil index option override", () => {
    rendered = fields("post[]", { model: post(), index: null }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[][title]' type='text' value='Hello World' id='post__title' />" +
      "<textarea name='post[][body]' id='post__body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[][secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[][secret]' checked='checked' type='checkbox' value='1' id='post__secret' />";

    assertDomEqual(expected, rendered);
  });

  it("fields with index option override", () => {
    rendered = fields("post[]", { model: post(), index: "abc" }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[abc][title]' type='text' value='Hello World' id='post_abc_title' />" +
      "<textarea name='post[abc][body]' id='post_abc_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[abc][secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[abc][secret]' checked='checked' type='checkbox' value='1' id='post_abc_secret' />";

    assertDomEqual(expected, rendered);
  });

  it("fields without object", () => {
    rendered = fields("post", {}, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[title]' type='text' value='Hello World' id='post_title' />" + postFields;

    assertDomEqual(expected, rendered);
  });

  it("fields with only object", () => {
    rendered = fields(null, { model: post() }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[title]' type='text' value='Hello World' id='post_title' />" + postFields;

    assertDomEqual(expected, rendered);
  });

  it("fields with only object array", () => {
    rendered = fields(null, { model: [post(), comment] }, (f) => {
      concat(f.textField("name"));
    });

    const expected = `<input type="text" value="new comment" name="comment[name]" id="comment_name" />`;

    assertDomEqual(expected, rendered);
  });

  it("fields object with bracketed name", () => {
    rendered = fields("author[post]", { model: post() }, (f) => {
      concat(f.label("title"));
      concat(f.textField("title"));
    });

    assertDomEqual(
      '<label for="author_post_title">Title</label>' +
        "<input name='author[post][title]' type='text' value='Hello World' id='author_post_title' id='author_post_1_title' />",
      rendered,
    );
  });

  it("fields object with bracketed name and index", () => {
    rendered = fields("author[post]", { model: post(), index: 1 }, (f) => {
      concat(f.label("title"));
      concat(f.textField("title"));
    });

    assertDomEqual(
      '<label for="author_post_1_title">Title</label>' +
        "<input name='author[post][1][title]' type='text' value='Hello World' id='author_post_1_title' />",
      rendered,
    );
  });

  it("form builder does not have form with method", () => {
    assertNotIncludes(publicInstanceMethods(FormBuilderClass), "formWith");
  });

  it("form with with html options adds options to form tag", () => {
    formWith(
      { model: post(), html: { id: "some_form", class: "some_class", multipart: true } },
      () => {},
    );
    const expected = wholeForm("/posts/123", "some_form", "some_class", {
      method: "patch",
      multipart: "multipart/form-data",
    });

    assertDomEqual(expected, rendered);
  });

  it("form with with string url option", () => {
    formWith({ model: post(), url: "http://www.otherdomain.com" }, () => {});

    assertDomEqual(
      wholeForm("http://www.otherdomain.com", null, null, { method: "patch" }),
      rendered,
    );
  });

  it("form with with hash url option", () => {
    formWith({ model: post(), url: { controller: "controller", action: "action" } }, () => {});

    assertEqual("controller", urlForOptions["controller"]);
    assertEqual("action", urlForOptions["action"]);
  });

  it("form with with record url option", () => {
    formWith({ model: post(), url: post() }, () => {});

    const expected = wholeForm("/posts/123", null, null, { method: "patch" });
    assertDomEqual(expected, rendered);
  });

  it("form with with existing object", () => {
    formWith({ model: post() }, () => {});

    const expected = wholeForm("/posts/123", null, null, { method: "patch" });
    assertDomEqual(expected, rendered);
  });

  it("form with with new object", () => {
    const post = new Post();
    post.persisted = false;
    Object.assign(post, { toKey: () => null });

    formWith({ model: post }, () => {});

    const expected = wholeForm("/posts");
    assertDomEqual(expected, rendered);
  });

  it("form with with existing object in list", () => {
    comment.save();
    formWith({ model: [post(), comment] }, () => {});

    const expected = wholeForm(helpers().postCommentPath(post(), comment), null, null, {
      method: "patch",
    });
    assertDomEqual(expected, rendered);
  });

  it("form with with new object in list", () => {
    formWith({ model: [post(), comment] }, () => {});

    const expected = wholeForm(helpers().postCommentsPath(post()));
    assertDomEqual(expected, rendered);
  });

  it("form with with existing object and namespace in list", () => {
    comment.save();
    formWith({ model: [":admin", post(), comment] }, () => {});

    const expected = wholeForm(helpers().adminPostCommentPath(post(), comment), null, null, {
      method: "patch",
    });
    assertDomEqual(expected, rendered);
  });

  it("form with with new object and namespace in list", () => {
    formWith({ model: [":admin", post(), comment] }, () => {});

    const expected = wholeForm(helpers().adminPostCommentsPath(post()));
    assertDomEqual(expected, rendered);
  });

  it("form with with existing object and custom url", () => {
    formWith({ model: post(), url: "/super_posts" }, () => {});

    const expected = wholeForm("/super_posts", null, null, { method: "patch" });
    assertDomEqual(expected, rendered);
  });

  it("form with with default method as patch", () => {
    formWith({ model: post() }, () => {});
    const expected = wholeForm("/posts/123", null, null, { method: "patch" });
    assertDomEqual(expected, rendered);
  });

  it("form with with data attributes", () => {
    formWith({ model: post(), data: { behavior: "stuff" } }, () => {});
    assertMatch(/data-behavior="stuff"/, String(rendered));
    assertMatch(/data-remote="true"/, String(rendered));
  });

  it("fields returns block result", () => {
    const output = fields(null, { model: new Post() }, () => "fields");
    assertEqual("fields", output);
  });

  it("form with only instantiates builder once", () => {
    let initializationCount = 0;
    const builderClass = class extends FormBuilderClass {
      constructor(...args: ConstructorParameters<typeof FormBuilderClass>) {
        super(...args);
        initializationCount += 1;
      }
    };

    formWith({ model: post(), builder: builderClass }, () => {});
    assertEqual(1, initializationCount, "form builder instantiated more than once");
  });

  it("form with with id option", () => {
    formWith({ model: new Post(), id: "new_special_post" }, (form) => {
      concat(form.button(null, { form: form.id() }));
    });

    const expected = wholeForm(
      "/posts",
      "new_special_post",
      null,
      {},
      () => '<button name="button" type="submit" form="new_special_post">Create Post</button>',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with id option nested in html", () => {
    formWith({ model: new Post(), html: { id: "new_special_post" } }, (form) => {
      concat(form.button(null, { form: form.id() }));
    });

    const expected = wholeForm(
      "/posts",
      "new_special_post",
      null,
      {},
      () => '<button name="button" type="submit" form="new_special_post">Create Post</button>',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with competing id option nested in html", () => {
    formWith({ model: new Post(), id: "ignored", html: { id: "new_special_post" } }, (form) => {
      concat(form.button(null, { form: form.id() }));
    });

    const expected = wholeForm(
      "/posts",
      "new_special_post",
      null,
      {},
      () => '<button name="button" type="submit" form="new_special_post">Create Post</button>',
    );

    assertDomEqual(expected, rendered);
  });
});
