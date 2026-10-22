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
  isBlank,
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
import {
  formWithGeneratesIds,
  formWithGeneratesRemoteForms,
  setFormWithGeneratesIds,
  setFormWithGeneratesRemoteForms,
} from "../../helpers/form-helper.js";
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
  it("form with with block and method in tse", async () => {
    const rendered = await view.render({
      inline:
        "<%= formWith({ url: 'http://www.example.com', method: 'put' }, () => { %>Hello world!<% }) %>",
    });
    const expected = wholeForm("http://www.example.com", { method: "put" }, () => "Hello world!");
    assertDomEqual(expected, rendered);
  });

  it("form with with block in tse and local true", async () => {
    const rendered = await view.render({
      inline:
        "<%= formWith({ url: 'http://www.example.com', local: true }, () => { %>Hello world!<% }) %>",
    });
    const expected = wholeForm("http://www.example.com", { local: true }, () => "Hello world!");
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

  this.get("/foo", { to: "controller#action" });
  this.root({ to: "main#index" });
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
    view.urlFor = function (this: Base, object: unknown): string {
      urlForOptions = object as Record<string, unknown>;

      if (isPlainObject(object) && isBlank(object["useRoute"]) && isBlank(object["controller"])) {
        object["controller"] = "main";
        object["action"] = "index";
      }

      return (Object.getPrototypeOf(this) as Base).urlFor.call(this, object);
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

  const postFormFields = titleField + postFields;

  function postFormBody(f: FormBuilder): void {
    concat(f.textField("title"));
    concat(f.textarea("body"));
    concat(f.checkbox("secret"));
  }

  const selectHtml = (ids: boolean): string =>
    `<select name='post[category]'${ids ? " id='post_category'" : ""}><option value='animal'>animal</option>\n<option value='economy'>economy</option>\n<option value='sports'>sports</option></select>`;

  it("form with", () => {
    formWith({ model: post(), id: "create-post" }, (f) => {
      concat(f.label("title", null, {}, () => "The Title"));
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
      concat(f.select("category", ["animal", "economy", "sports"]));
      concat(f.submit("Create post"));
      concat(f.button("Create post"));
      concat(f.button(null, {}, () => concat(contentTag("span", "Create post"))));
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      null,
      { method: "patch" },
      () =>
        "<label for='post_title'>The Title</label>" +
        postFormFields +
        selectHtml(true) +
        "<input name='commit' data-disable-with='Create post' type='submit' value='Create post' />" +
        "<button name='button' type='submit'>Create post</button>" +
        "<button name='button' type='submit'><span>Create post</span></button>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with persisted to model", () => {
    const postForm = { toModel: () => post() };

    formWith({ model: postForm }, () => {});

    assertDomEqual(
      wholeForm("/posts/123", null, null, { method: "patch" }, () => ""),
      rendered,
    );
  });

  it("form with with new record to model", () => {
    const postForm = { toModel: () => new Post() };

    formWith({ model: postForm }, () => {});

    assertDomEqual(
      wholeForm("/posts", null, null, { method: "post" }, () => ""),
      rendered,
    );
  });

  it("form with button yields translation", () => {
    formWith({ model: post() }, (f) => {
      concat(f.button(null, {}, (value: unknown) => concat(contentTag("span", value))));
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () => "<button name='button' type='submit'><span>Update Post</span></button>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with not outputting ids", () => {
    const oldValue = formWithGeneratesIds;
    setFormWithGeneratesIds(false);
    try {
      formWith({ model: post(), id: "create-post" }, (f) => {
        concat(f.label("title", null, {}, () => "The Title"));
        concat(f.textField("title"));
        concat(f.textarea("body"));
        concat(f.checkbox("secret"));
        concat(f.select("category", ["animal", "economy", "sports"]));
        concat(f.submit("Create post"));
      });

      const expected = wholeForm(
        "/posts/123",
        "create-post",
        null,
        { method: "patch" },
        () =>
          "<label>The Title</label>" +
          "<input name='post[title]' type='text' value='Hello World' />" +
          "<textarea name='post[body]'>\nBack to the hill and over it again!</textarea>" +
          "<input name='post[secret]' type='hidden' value='0' autocomplete='off' />" +
          "<input name='post[secret]' checked='checked' type='checkbox' value='1' />" +
          selectHtml(false) +
          "<input name='commit' data-disable-with='Create post' type='submit' value='Create post' />",
      );

      assertDomEqual(expected, rendered);
    } finally {
      setFormWithGeneratesIds(oldValue);
    }
  });

  it("form with doesnt call private or protected properties on form object skipping value", () => {
    const obj = new (class {
      private privateProperty(): string {
        return "That would be great.";
      }

      protected protectedProperty(): string {
        return "I believe you have my stapler.";
      }
    })();

    formWith({ model: obj, scope: "other_name", url: "/", id: "edit-other-name" }, (f) => {
      assertDomEqual(
        '<input type="hidden" name="other_name[private_property]" id="other_name_private_property" autocomplete="off">',
        f.hiddenField("private_property"),
      );
      assertDomEqual(
        '<input type="hidden" name="other_name[protected_property]"  id="other_name_protected_property" autocomplete="off">',
        f.hiddenField("protected_property"),
      );
    });
  });

  function activePost(id?: unknown): Post {
    const p = new Post();
    Object.assign(p, { active: false });
    if (id !== undefined) Object.assign(p, { id });
    return p;
  }

  const radios = (prefix: string, wrap: boolean): string => {
    const name = `post${prefix ? `[${prefix}]` : ""}[active]`;
    const id = `post_${prefix ? `${prefix}_` : ""}active`;
    const input = (v: string, checked: boolean): string =>
      `<input ${checked ? "checked='checked' " : ""}name='${name}' type='radio' value='${v}' id='${id}_${v}' />`;
    const pair = (v: string, checked: boolean): string =>
      wrap
        ? `<label for='${id}_${v}'>${input(v, checked)}${v}</label>`
        : `${input(v, checked)}<label for='${id}_${v}'>${v}</label>`;
    return (
      `<input type='hidden' name='${name}' value='' autocomplete='off' />` +
      pair("true", false) +
      pair("false", true)
    );
  };

  it("form with with collection select", () => {
    formWith({ model: activePost() }, (f) => {
      concat(f.collectionSelect("active", [true, false], "toString", "toString"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<select name='post[active]' id='post_active'>" +
        "<option value='true'>true</option>\n" +
        "<option selected='selected' value='false'>false</option>" +
        "</select>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with collection radio buttons", () => {
    formWith({ model: activePost() }, (f) => {
      concat(f.collectionRadioButtons("active", [true, false], "toString", "toString"));
    });

    assertDomEqual(
      wholeForm("/posts", null, null, {}, () => radios("", false)),
      rendered,
    );
  });

  it("form with with collection radio buttons with custom builder block", () => {
    formWith({ model: activePost() }, (f) => {
      const renderedRadioButtons = f.collectionRadioButtons(
        "active",
        [true, false],
        "toString",
        "toString",
        {},
        {},
        (b) => b.label({}, () => b.radioButton().plus(b.text)),
      );
      concat(renderedRadioButtons);
    });

    assertDomEqual(
      wholeForm("/posts", null, null, {}, () => radios("", true)),
      rendered,
    );
  });

  it("form with with collection radio buttons with custom builder block does not leak the template", () => {
    formWith({ model: activePost(1) }, (f) => {
      const renderedRadioButtons = f.collectionRadioButtons(
        "active",
        [true, false],
        "toString",
        "toString",
        {},
        {},
        (b) => b.label({}, () => b.radioButton().plus(b.text)),
      );
      concat(renderedRadioButtons);
      concat(f.hiddenField("id"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        radios("", true) +
        "<input name='post[id]' type='hidden' value='1' id='post_id' autocomplete='off' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with index and with collection radio buttons", () => {
    formWith({ model: activePost(), index: "1" }, (f) => {
      concat(f.collectionRadioButtons("active", [true, false], "toString", "toString"));
    });

    assertDomEqual(
      wholeForm("/posts", null, null, {}, () => radios("1", false)),
      rendered,
    );
  });

  function tagPost(tagIds: number[], id?: unknown): Post {
    const p = new Post();
    Object.assign(p, { tag_ids: tagIds });
    if (id !== undefined) Object.assign(p, { id });
    return p;
  }

  const checkboxes = (
    prefix: string,
    values: number[],
    checked: number[],
    wrap: boolean,
  ): string => {
    const name = `post${prefix ? `[${prefix}]` : ""}[tag_ids][]`;
    const id = `post_${prefix ? `${prefix}_` : ""}tag_ids`;
    let out = `<input name='${name}' type='hidden' value='' autocomplete='off' />`;
    for (const i of values) {
      const input = `<input ${checked.includes(i) ? "checked='checked' " : ""}name='${name}' type='checkbox' value='${i}' id='${id}_${i}' />`;
      out += wrap
        ? `<label for='${id}_${i}'>${input}Tag ${i}</label>`
        : `${input}<label for='${id}_${i}'>Tag ${i}</label>`;
    }
    return out;
  };

  const tagCollection = [1, 2, 3].map((i) => [i, `Tag ${i}`]);

  it("form with with collection checkboxes", () => {
    formWith({ model: tagPost([1, 3]) }, (f) => {
      concat(f.collectionCheckboxes("tag_ids", tagCollection, "first", "last"));
    });

    const expected = wholeForm("/posts", null, null, {}, () =>
      checkboxes("", [1, 2, 3], [1, 3], false),
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with collection checkboxes with custom builder block", () => {
    formWith({ model: tagPost([1, 3]) }, (f) => {
      const renderedCheckboxes = f.collectionCheckboxes(
        "tag_ids",
        tagCollection,
        "first",
        "last",
        {},
        {},
        (b) => b.label({}, () => b.checkbox().plus(b.text)),
      );
      concat(renderedCheckboxes);
    });

    const expected = wholeForm("/posts", null, null, {}, () =>
      checkboxes("", [1, 2, 3], [1, 3], true),
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with collection checkboxes with custom builder block does not leak the template", () => {
    formWith({ model: tagPost([1, 3], 1) }, (f) => {
      const renderedCheckboxes = f.collectionCheckboxes(
        "tag_ids",
        tagCollection,
        "first",
        "last",
        {},
        {},
        (b) => b.label({}, () => b.checkbox().plus(b.text)),
      );
      concat(renderedCheckboxes);
      concat(f.hiddenField("id"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        checkboxes("", [1, 2, 3], [1, 3], true) +
        "<input name='post[id]' type='hidden' value='1' id='post_id' autocomplete='off' />",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with index and with collection checkboxes", () => {
    formWith({ model: tagPost([1]), index: "1" }, (f) => {
      concat(f.collectionCheckboxes("tag_ids", [[1, "Tag 1"]], "first", "last"));
    });

    const expected = wholeForm("/posts", null, null, {}, () => checkboxes("1", [1], [1], false));
    assertDomEqual(expected, rendered);
  });

  it("form with with file field generate multipart", () => {
    formWith({ model: post(), id: "create-post" }, (f) => {
      concat(f.fileField("file"));
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      null,
      { method: "patch", multipart: "true" },
      () => "<input name='post[file]' type='file' id='post_file' />",
    );
    assertDomEqual(expected, rendered);
  });

  it("fields with file field generate multipart", () => {
    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comment", { model: post() }, (c) => {
          concat(c.fileField("file"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch", multipart: "true" },
      () => "<input name='post[comment][file]' type='file' id='post_comment_file'/>",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with format", () => {
    formWith({ model: post(), format: "json", id: "edit_post_123", class: "edit_post" }, (f) => {
      concat(f.label("title"));
    });

    const expected = wholeForm(
      "/posts/123.json",
      "edit_post_123",
      "edit_post",
      { method: "patch" },
      () => "<label for='post_title'>Title</label>",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with format and url", () => {
    formWith({ model: post(), format: "json", url: "/" }, (f) => {
      concat(f.label("title"));
    });

    const expected = wholeForm(
      "/",
      null,
      null,
      { method: "patch" },
      () => "<label for='post_title'>Title</label>",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with model using relative model naming", () => {
    const blogPost = new BlogPost("And his name will be forty and four.", 44);

    formWith({ model: blogPost }, (f) => {
      concat(f.textField("title"));
      concat(f.submit("Edit post"));
    });

    const expected = wholeForm(
      "/posts/44",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[title]' type='text' value='And his name will be forty and four.' id='post_title' />" +
        "<input name='commit' data-disable-with='Edit post' type='submit' value='Edit post' />",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with symbol scope", () => {
    formWith({ model: post(), scope: "other_name", id: "create-post" }, (f) => {
      concat(f.label("title", { class: "post_title" }));
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
      concat(f.submit("Create post"));
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      null,
      { method: "patch" },
      () =>
        "<label for='other_name_title' class='post_title'>Title</label>" +
        "<input name='other_name[title]' value='Hello World' type='text' id='other_name_title' />" +
        "<textarea name='other_name[body]' id='other_name_body'>\nBack to the hill and over it again!</textarea>" +
        "<input name='other_name[secret]' value='0' type='hidden' autocomplete='off' />" +
        "<input name='other_name[secret]' checked='checked' value='1' type='checkbox' id='other_name_secret' />" +
        "<input name='commit' value='Create post' data-disable-with='Create post' type='submit' />",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with method as part of html options", () => {
    formWith(
      { model: post(), url: "/", id: "create-post", html: { method: "delete" } },
      postFormBody,
    );

    const expected = wholeForm(
      "/",
      "create-post",
      null,
      { method: "delete" },
      () => postFormFields,
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with method", () => {
    formWith({ model: post(), url: "/", method: "delete", id: "create-post" }, postFormBody);

    const expected = wholeForm(
      "/",
      "create-post",
      null,
      { method: "delete" },
      () => postFormFields,
    );
    assertDomEqual(expected, rendered);
  });

  it("form with enables remote by default", () => {
    formWith({ model: post(), url: "/", id: "create-post", method: "patch" }, postFormBody);

    const expected = wholeForm("/", "create-post", null, { method: "patch" }, () => postFormFields);
    assertDomEqual(expected, rendered);
  });

  it("form is not remote by default if form with generates remote forms is false", () => {
    const oldValue = formWithGeneratesRemoteForms;
    setFormWithGeneratesRemoteForms(false);
    try {
      formWith({ model: post(), url: "/", id: "create-post", method: "patch" }, postFormBody);

      const expected = wholeForm(
        "/",
        "create-post",
        null,
        { method: "patch", local: true },
        () => postFormFields,
      );
      assertDomEqual(expected, rendered);
    } finally {
      setFormWithGeneratesRemoteForms(oldValue);
    }
  });

  it("form with without object", () => {
    formWith({ scope: "post", id: "create-post" }, postFormBody);

    assertDomEqual(
      wholeForm("/", "create-post", null, {}, () => postFormFields),
      rendered,
    );
  });

  it("form with with index", () => {
    formWith({ model: post(), scope: "post[]" }, (f) => {
      concat(f.label("title"));
      postFormBody(f);
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<label for='post_123_title'>Title</label>" +
        "<input name='post[123][title]' type='text' value='Hello World' id='post_123_title' />" +
        "<textarea name='post[123][body]' id='post_123_body'>\nBack to the hill and over it again!</textarea>" +
        "<input name='post[123][secret]' type='hidden' value='0' autocomplete='off' />" +
        "<input name='post[123][secret]' checked='checked' type='checkbox' value='1' id='post_123_secret' />",
    );
    assertDomEqual(expected, rendered);
  });

  it("form with with nil index option override", () => {
    formWith({ model: post(), scope: "post[]", index: null }, postFormBody);

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[][title]' type='text' value='Hello World' id='post__title' />" +
        "<textarea name='post[][body]' id='post__body' >\nBack to the hill and over it again!</textarea>" +
        "<input name='post[][secret]' type='hidden' value='0' autocomplete='off' />" +
        "<input name='post[][secret]' checked='checked' type='checkbox' value='1' id='post__secret' />",
    );
    assertDomEqual(expected, rendered);
  });
});
