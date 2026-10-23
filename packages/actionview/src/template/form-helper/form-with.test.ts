import "../../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet } from "@blazetrails/actionpack";
import { Conversion, Naming } from "@blazetrails/activemodel";
import {
  HashWithIndifferentAccess,
  I18n,
  Mock,
  assertEqual,
  assertMock,
  assertMatch,
  assertNotIncludes,
  expectCalledWith,
  extend,
  htmlSafe,
  humanize,
  isBlank,
  isPlainObject,
  isPresent,
  stub,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  Hash,
  include,
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
import { CheckBoxBuilder } from "../../helpers/tags/collection-check-boxes.js";
import { RadioButtonBuilder } from "../../helpers/tags/collection-radio-buttons.js";
import { Blog } from "../../test-helpers/fake-models.js";
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
  author_name: unknown = null;
  body: string | null = null;
  secret: unknown = null;
  author: unknown = null;
  comments: Comment[] = [];
  tags: unknown = [];
  category: unknown = null;
  errors = { get: (field: string) => (field === "author_name" ? ["can't be empty"] : []) };

  get ["secret?"](): unknown {
    return this.secret;
  }

  isPersisted(): boolean {
    return this.persisted;
  }

  set author_attributes(attributes: unknown) {}
  set comments_attributes(attributes: unknown) {}
  set tags_attributes(attributes: unknown) {}
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

  body: unknown = null;
  relevances: unknown = null;
  set relevances_attributes(attributes: unknown) {}

  get name(): string {
    const name = this.constructor.name.toLowerCase();
    return this.id == null ? `new ${name}` : `${name} #${String(this.id)}`;
  }
}

class Author extends Comment {
  post: unknown = null;
  set post_attributes(attributes: unknown) {}
}

class Tag {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  constructor(public id: unknown = null) {}

  toKey(): unknown[] | null {
    return this.id != null && this.id !== false ? [this.id] : null;
  }
  isPersisted(): boolean {
    return isPresent(this.id);
  }
  toParam(): unknown {
    return this.id != null && this.id !== false ? String(this.id) : this.id;
  }
  get value(): string {
    return this.id == null ? "new tag" : `tag #${String(this.id)}`;
  }

  relevances: unknown = null;
  set relevances_attributes(attributes: unknown) {}
}

class Relevance {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  constructor(public id: unknown = null) {}

  toKey(): unknown[] | null {
    return this.id != null && this.id !== false ? [this.id] : null;
  }
  isPersisted(): boolean {
    return isPresent(this.id);
  }
  toParam(): unknown {
    return this.id != null && this.id !== false ? String(this.id) : this.id;
  }
  get value(): string {
    const name = this.constructor.name.toLowerCase();
    return this.id == null ? `new ${name}` : `${name} #${String(this.id)}`;
  }
}

class CommentRelevance extends Relevance {}
class TagRelevance extends Relevance {}

class HashBackedAuthor extends Hash<string, unknown> {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  isPersisted(): boolean {
    return false;
  }
  get name(): string {
    return "hash backed author";
  }
}

class HashWithIndifferentAccessBackedAuthor extends HashWithIndifferentAccess {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  isPersisted(): boolean {
    return false;
  }
  get name(): string {
    return "hash backed author";
  }
}

class ArelLike {
  toAry(): boolean {
    return true;
  }
  each(block: (comment: Comment) => void): void {
    const a = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    a.forEach(block);
  }
  *[Symbol.iterator](): Iterator<Comment> {
    const a: Comment[] = [];
    this.each((c) => a.push(c));
    yield* a;
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
    post.author_name = "";
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
    const blogPost = new Blog.Post("And his name will be forty and four.", 44);
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

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)"
  it.skip("form with doesnt call private or protected properties on form object skipping value", () => {
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

  it("form with with collection select", () => {
    const post = new Post();
    Object.assign(post, { active: false });
    formWith({ model: post }, (f) => {
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
    const post = new Post();
    Object.assign(post, { active: false });
    formWith({ model: post }, (f) => {
      concat(f.collectionRadioButtons("active", [true, false], "toString", "toString"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<input type='hidden' name='post[active]' value='' autocomplete='off' />" +
        "<input name='post[active]' type='radio' value='true' id='post_active_true' />" +
        "<label for='post_active_true'>true</label>" +
        "<input checked='checked' name='post[active]' type='radio' value='false' id='post_active_false' />" +
        "<label for='post_active_false'>false</label>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with collection radio buttons with custom builder block", () => {
    const post = new Post();
    Object.assign(post, { active: false });

    formWith({ model: post }, (f) => {
      const renderedRadioButtons = f.collectionRadioButtons(
        "active",
        [true, false],
        "toString",
        "toString",
        {},
        {},
        (b) => b.label({}, () => (b as RadioButtonBuilder).radioButton().plus(b.text)),
      );
      concat(renderedRadioButtons);
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<input type='hidden' name='post[active]' value='' autocomplete='off' />" +
        "<label for='post_active_true'>" +
        "<input name='post[active]' type='radio' value='true' id='post_active_true' />" +
        "true</label>" +
        "<label for='post_active_false'>" +
        "<input checked='checked' name='post[active]' type='radio' value='false' id='post_active_false' />" +
        "false</label>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with collection radio buttons with custom builder block does not leak the template", () => {
    const post = new Post();
    Object.assign(post, { active: false, id: 1 });

    formWith({ model: post }, (f) => {
      const renderedRadioButtons = f.collectionRadioButtons(
        "active",
        [true, false],
        "toString",
        "toString",
        {},
        {},
        (b) => b.label({}, () => (b as RadioButtonBuilder).radioButton().plus(b.text)),
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
        "<input type='hidden' name='post[active]' value='' autocomplete='off' />" +
        "<label for='post_active_true'>" +
        "<input name='post[active]' type='radio' value='true' id='post_active_true' />" +
        "true</label>" +
        "<label for='post_active_false'>" +
        "<input checked='checked' name='post[active]' type='radio' value='false' id='post_active_false' />" +
        "false</label>" +
        "<input name='post[id]' type='hidden' value='1' id='post_id' autocomplete='off' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with index and with collection radio buttons", () => {
    const post = new Post();
    Object.assign(post, { active: false });

    formWith({ model: post, index: "1" }, (f) => {
      concat(f.collectionRadioButtons("active", [true, false], "toString", "toString"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<input type='hidden' name='post[1][active]' value='' autocomplete='off' />" +
        "<input name='post[1][active]' type='radio' value='true' id='post_1_active_true' />" +
        "<label for='post_1_active_true'>true</label>" +
        "<input checked='checked' name='post[1][active]' type='radio' value='false' id='post_1_active_false' />" +
        "<label for='post_1_active_false'>false</label>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with collection checkboxes", () => {
    const post = new Post();
    Object.assign(post, { tag_ids: [1, 3] });
    const collection = [1, 2, 3].map((i) => [i, `Tag ${i}`]);
    formWith({ model: post }, (f) => {
      concat(f.collectionCheckboxes("tag_ids", collection, "first", "last"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<input name='post[tag_ids][]' type='hidden' value='' autocomplete='off' />" +
        "<input checked='checked' name='post[tag_ids][]' type='checkbox' value='1' id='post_tag_ids_1' />" +
        "<label for='post_tag_ids_1'>Tag 1</label>" +
        "<input name='post[tag_ids][]' type='checkbox' value='2' id='post_tag_ids_2' />" +
        "<label for='post_tag_ids_2'>Tag 2</label>" +
        "<input checked='checked' name='post[tag_ids][]' type='checkbox' value='3' id='post_tag_ids_3' />" +
        "<label for='post_tag_ids_3'>Tag 3</label>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with collection checkboxes with custom builder block", () => {
    const post = new Post();
    Object.assign(post, { tag_ids: [1, 3] });
    const collection = [1, 2, 3].map((i) => [i, `Tag ${i}`]);
    formWith({ model: post }, (f) => {
      const renderedCheckboxes = f.collectionCheckboxes(
        "tag_ids",
        collection,
        "first",
        "last",
        {},
        {},
        (b) => b.label({}, () => (b as CheckBoxBuilder).checkbox().plus(b.text)),
      );
      concat(renderedCheckboxes);
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<input name='post[tag_ids][]' type='hidden' value='' autocomplete='off' />" +
        "<label for='post_tag_ids_1'>" +
        "<input checked='checked' name='post[tag_ids][]' type='checkbox' value='1' id='post_tag_ids_1' />" +
        "Tag 1</label>" +
        "<label for='post_tag_ids_2'>" +
        "<input name='post[tag_ids][]' type='checkbox' value='2' id='post_tag_ids_2' />" +
        "Tag 2</label>" +
        "<label for='post_tag_ids_3'>" +
        "<input checked='checked' name='post[tag_ids][]' type='checkbox' value='3' id='post_tag_ids_3' />" +
        "Tag 3</label>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with collection checkboxes with custom builder block does not leak the template", () => {
    const post = new Post();
    Object.assign(post, { tag_ids: [1, 3], id: 1 });
    const collection = [1, 2, 3].map((i) => [i, `Tag ${i}`]);

    formWith({ model: post }, (f) => {
      const renderedCheckboxes = f.collectionCheckboxes(
        "tag_ids",
        collection,
        "first",
        "last",
        {},
        {},
        (b) => b.label({}, () => (b as CheckBoxBuilder).checkbox().plus(b.text)),
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
        "<input name='post[tag_ids][]' type='hidden' value='' autocomplete='off' />" +
        "<label for='post_tag_ids_1'>" +
        "<input checked='checked' name='post[tag_ids][]' type='checkbox' value='1' id='post_tag_ids_1' />" +
        "Tag 1</label>" +
        "<label for='post_tag_ids_2'>" +
        "<input name='post[tag_ids][]' type='checkbox' value='2' id='post_tag_ids_2' />" +
        "Tag 2</label>" +
        "<label for='post_tag_ids_3'>" +
        "<input checked='checked' name='post[tag_ids][]' type='checkbox' value='3' id='post_tag_ids_3' />" +
        "Tag 3</label>" +
        "<input name='post[id]' type='hidden' value='1' id='post_id' autocomplete='off' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with index and with collection checkboxes", () => {
    const post = new Post();
    Object.assign(post, { tag_ids: [1] });
    const collection = [[1, "Tag 1"]];

    formWith({ model: post, index: "1" }, (f) => {
      concat(f.collectionCheckboxes("tag_ids", collection, "first", "last"));
    });

    const expected = wholeForm(
      "/posts",
      null,
      null,
      {},
      () =>
        "<input name='post[1][tag_ids][]' type='hidden' value='' autocomplete='off' />" +
        "<input checked='checked' name='post[1][tag_ids][]' type='checkbox' value='1' id='post_1_tag_ids_1' />" +
        "<label for='post_1_tag_ids_1'>Tag 1</label>",
    );

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
    const blogPost = new Blog.Post("And his name will be forty and four.", 44);

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

  it("form with label error wrapping", () => {
    formWith({ model: post() }, (f) => {
      concat(f.label("author_name", null, { class: "label" }));
      concat(f.textField("author_name"));
      concat(f.submit("Create post"));
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<div class='field_with_errors'><label for='post_author_name' class='label'>Author name</label></div>" +
        "<div class='field_with_errors'><input name='post[author_name]' type='text' value='' id='post_author_name' /></div>" +
        "<input name='commit' data-disable-with='Create post' type='submit' value='Create post' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with label error wrapping without conventional instance variable", () => {
    const post = (view as unknown as { post: Post }).post;
    delete (view as unknown as { post?: Post }).post;

    formWith({ model: post }, (f) => {
      concat(f.label("author_name", null, { class: "label" }));
      concat(f.textField("author_name"));
      concat(f.submit("Create post"));
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<div class='field_with_errors'><label for='post_author_name' class='label'>Author name</label></div>" +
        "<div class='field_with_errors'><input name='post[author_name]' type='text' value='' id='post_author_name' /></div>" +
        "<input name='commit' data-disable-with='Create post' type='submit' value='Create post' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with label error wrapping block and non block versions", () => {
    formWith({ model: post() }, (f) => {
      concat(f.label("author_name", "Name", { class: "label" }));
      concat(f.label("author_name", { class: "label" }, {}, () => "Name"));
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<div class='field_with_errors'><label for='post_author_name' class='label'>Name</label></div>" +
        "<div class='field_with_errors'><label for='post_author_name' class='label'>Name</label></div>",
    );

    assertDomEqual(expected, rendered);
  });

  it("fields with attributes not on model deep nested", () => {
    comment.save();
    formWith({ scope: "posts" }, (f) => {
      return f.fields("post[]", { model: post() }, (f2) => {
        f2.textField("id");
        for (const comment of post().comments) {
          concat(
            f2.fields("comment[]", { model: comment }, (c) => {
              concat(c.textField("dont_exist_on_model"));
            }),
          );
        }
      });
    });

    const expected = wholeForm(
      "/",
      null,
      null,
      {},
      () =>
        '<input name="posts[post][0][comment][1][dont_exist_on_model]" type="text" id="posts_post_0_comment_1_dont_exist_on_model" >',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields", () => {
    comment.body = "Hello World";
    formWith({ model: post() }, (f) => {
      concat(
        f.fields(null, { model: comment }, (c) => {
          concat(c.textField("body"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[comment][body]' type='text' value='Hello World' id='post_comment_body' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("deep nested fields", () => {
    comment.save();
    formWith({ scope: "posts" }, (f) => {
      return f.fields("post[]", { model: post() }, (f2) => {
        f2.textField("id");
        for (const comment of post().comments) {
          concat(
            f2.fields("comment[]", { model: comment }, (c) => {
              concat(c.textField("name"));
            }),
          );
        }
      });
    });

    const expected = wholeForm(
      "/",
      null,
      null,
      {},
      () =>
        "<input name='posts[post][0][comment][1][name]' type='text' value='comment #1' id='posts_post_0_comment_1_name' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with nested collections", () => {
    formWith({ model: post(), scope: "post[]" }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("comment[]", { model: comment }, (c) => {
          concat(c.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[123][title]' type='text' value='Hello World' id='post_123_title' />" +
        "<input name='post[123][comment][][name]' type='text' value='new comment' id='post_123_comment__name' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with index and parent fields", () => {
    formWith({ model: post(), index: 1 }, (c) => {
      concat(c.textField("title"));
      concat(
        c.fields("comment", { model: comment, index: 1 }, (r) => {
          concat(r.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[1][title]' type='text' value='Hello World' id='post_1_title' />" +
        "<input name='post[1][comment][1][name]' type='text' value='new comment' id='post_1_comment_1_name' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with with index and nested fields", () => {
    formWith({ model: post(), index: 1 }, (f) => {
      concat(
        f.fields("comment", { model: post() }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[1][comment][title]' type='text' value='Hello World' id='post_1_comment_title' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with index on both", () => {
    formWith({ model: post(), index: 1 }, (f) => {
      concat(
        f.fields("comment", { model: post(), index: 5 }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[1][comment][5][title]' type='text' value='Hello World' id='post_1_comment_5_title' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with auto index", () => {
    formWith({ model: post(), scope: "post[]" }, (f) => {
      concat(
        f.fields("comment", { model: post() }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[123][comment][title]' type='text' value='Hello World' id='post_123_comment_title' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with index radio button", () => {
    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comment", { model: post(), index: 5 }, (c) => {
          concat(c.radioButton("title", "hello"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[comment][5][title]' type='radio' value='hello' id='post_comment_5_title_hello' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with auto index on both", () => {
    formWith({ model: post(), scope: "post[]" }, (f) => {
      concat(
        f.fields("comment[]", { model: post() }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[123][comment][123][title]' type='text' value='Hello World' id='post_123_comment_123_title' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with index and auto index", () => {
    formWith({ model: post(), scope: "post[]" }, (f) => {
      concat(
        f.fields("comment", { model: post(), index: 5 }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    let expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[123][comment][5][title]' type='text' value='Hello World' id='post_123_comment_5_title' />",
    );

    assertDomEqual(expected, rendered);

    formWith({ model: post(), index: 1 }, (f) => {
      concat(
        f.fields("comment[]", { model: post() }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        "<input name='post[1][comment][123][title]' type='text' value='Hello World' id='post_1_comment_123_title' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with a new record on a nested attributes one to one association", () => {
    post().author = new Author();

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="new author" id="post_author_attributes_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with explicitly passed object on a nested attributes one to one association", () => {
    formWith({ model: post() }, (f) => {
      f.fields("author", { model: new Author(123) }, (af) => {
        expect(af.object).not.toBeNull();
        expect((af.object as Author).id).toBe(123);
      });
    });
  });

  it("nested fields with an existing record on a nested attributes one to one association", () => {
    post().author = new Author(321);

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />' +
        '<input name="post[author_attributes][id]" type="hidden" value="321" id="post_author_attributes_id" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with an existing record on a nested attributes one to one association using tse and inline block", () => {
    post().author = new Author(321);

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          return af.textField("name");
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />' +
        '<input name="post[author_attributes][id]" type="hidden" value="321" id="post_author_attributes_id" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with an existing record on a nested attributes one to one association with disabled hidden id", () => {
    post().author = new Author(321);

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", { skipId: true }, (af) => {
          return af.textField("name");
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with an existing record on a nested attributes one to one association with disabled hidden id inherited", () => {
    post().author = new Author(321);

    formWith({ model: post(), skipId: true }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          return af.textField("name");
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with an existing record on a nested attributes one to one association with disabled hidden id override", () => {
    post().author = new Author(321);

    formWith({ model: post(), skipId: true }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", { skipId: false }, (af) => {
          return af.textField("name");
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />' +
        '<input name="post[author_attributes][id]" type="hidden" value="321" id="post_author_attributes_id" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes one to one association with explicit hidden field placement", () => {
    post().author = new Author(321);

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          concat(af.hiddenField("id"));
          concat(af.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][id]" type="hidden" value="321" id="post_author_attributes_id" autocomplete="off" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes collection association", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][0][id]" type="hidden" value="1" id="post_comments_attributes_0_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />' +
        '<input name="post[comments_attributes][1][id]" type="hidden" value="2" id="post_comments_attributes_1_id" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes collection association with disabled hidden id", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post().author = new Author(321);

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          concat(af.textField("name"));
        }),
      );
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment, skipId: true }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />' +
        '<input name="post[author_attributes][id]" type="hidden" value="321" id="post_author_attributes_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes collection association with disabled hidden id inherited", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post().author = new Author(321);

    formWith({ model: post(), skipId: true }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", {}, (af) => {
          concat(af.textField("name"));
        }),
      );
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes collection association with disabled hidden id override", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post().author = new Author(321);

    formWith({ model: post(), skipId: true }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("author", { skipId: false }, (af) => {
          concat(af.textField("name"));
        }),
      );
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[author_attributes][name]" type="text" value="author #321" id="post_author_attributes_name" />' +
        '<input name="post[author_attributes][id]" type="hidden" value="321" id="post_author_attributes_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes collection association using tse and inline block", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            return cf.textField("name");
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][0][id]" type="hidden" value="1" id="post_comments_attributes_0_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />' +
        '<input name="post[comments_attributes][1][id]" type="hidden" value="2" id="post_comments_attributes_1_id" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a nested attributes collection association with explicit hidden field placement", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            concat(cf.hiddenField("id"));
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[comments_attributes][0][id]" type="hidden" value="1" id="post_comments_attributes_0_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][1][id]" type="hidden" value="2" id="post_comments_attributes_1_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with new records on a nested attributes collection association", () => {
    post().comments = [new Comment(), new Comment()];

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="new comment" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="new comment" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing and new records on a nested attributes collection association", () => {
    post().comments = [new Comment(321), new Comment()];

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      for (const comment of post().comments) {
        concat(
          f.fields("comments", { model: comment }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #321" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][0][id]" type="hidden" value="321" id="post_comments_attributes_0_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="new comment" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
  });
  it("nested fields with an empty supplied attributes collection", () => {
    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      f.fields("comments", { model: [] }, (cf) => {
        concat(cf.textField("name"));
      });
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () => '<input name="post[title]" type="text" value="Hello World" id="post_title" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with existing records on a supplied nested attributes collection", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("comments", { model: post().comments }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        commentFields12,
    );

    assertDomEqual(expected, rendered);
  });

  const commentFields12 =
    '<input name="post[comments_attributes][0][name]" type="text" value="comment #1" id="post_comments_attributes_0_name" />' +
    '<input name="post[comments_attributes][0][id]" type="hidden" value="1" id="post_comments_attributes_0_id" autocomplete="off" />' +
    '<input name="post[comments_attributes][1][name]" type="text" value="comment #2" id="post_comments_attributes_1_name" />' +
    '<input name="post[comments_attributes][1][id]" type="hidden" value="2" id="post_comments_attributes_1_id" autocomplete="off" />';

  it("nested fields arel like", () => {
    (post() as unknown as { comments: unknown }).comments = new ArelLike();

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("comments", { model: post().comments }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        commentFields12,
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields label translation with more than 10 records", () => {
    post().comments = Array.from({ length: 11 }, (_, id) => new Comment(id + 1));

    const mock = new Mock();
    for (const _ of post().comments) {
      expectCalledWith(
        mock,
        ["post.comments.body", { default: [":comment.body", ""], scope: "helpers.label" }],
        { returns: "body" },
      );
    }

    stub(I18n, "t", mock, [], () => {
      formWith({ model: post() }, (f) => {
        f.fields("comments", (cf) => {
          concat(cf.label("body"));
        });
      });
    });

    assertMock(mock);
  });

  it("nested fields with existing records on a supplied nested attributes collection different from record one", () => {
    const comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post().comments = [];

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("comments", { model: comments }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        commentFields12,
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields on a nested attributes collection association yields only builder", () => {
    post().comments = [new Comment(321), new Comment()];
    const yieldedComments: unknown[] = [];

    formWith({ model: post() }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fields("comments", (cf) => {
          concat(cf.textField("name"));
          yieldedComments.push(cf.object);
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[title]" type="text" value="Hello World" id="post_title" />' +
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #321" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][0][id]" type="hidden" value="321" id="post_comments_attributes_0_id" autocomplete="off" />' +
        '<input name="post[comments_attributes][1][name]" type="text" value="new comment" id="post_comments_attributes_1_name" />',
    );

    assertDomEqual(expected, rendered);
    expect(post().comments).toEqual(yieldedComments);
  });

  const abcFields =
    '<input name="post[comments_attributes][abc][name]" type="text" value="comment #321" id="post_comments_attributes_abc_name" />' +
    '<input name="post[comments_attributes][abc][id]" type="hidden" value="321" id="post_comments_attributes_abc_id" autocomplete="off" />';

  it("nested fields with child index option override on a nested attributes collection association", () => {
    post().comments = [];

    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comments", { model: new Comment(321), childIndex: "abc" }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    const expected = wholeForm("/posts/123", null, null, { method: "patch" }, () => abcFields);

    assertDomEqual(expected, rendered);
  });

  it("nested fields with child index as lambda option override on a nested attributes collection association", () => {
    post().comments = [];

    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comments", { model: new Comment(321), childIndex: () => "abc" }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    const expected = wholeForm("/posts/123", null, null, { method: "patch" }, () => abcFields);

    assertDomEqual(expected, rendered);
  });

  class FakeAssociationProxy {
    toAry(): number[] {
      return [1, 2, 3];
    }
  }

  it("nested fields with child index option override on a nested attributes collection association with proxy", () => {
    (post() as unknown as { comments: unknown }).comments = new FakeAssociationProxy();

    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comments", { model: new Comment(321), childIndex: "abc" }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    const expected = wholeForm("/posts/123", null, null, { method: "patch" }, () => abcFields);

    assertDomEqual(expected, rendered);
  });

  it("nested fields index method with existing records on a nested attributes collection association", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formWith({ model: post() }, (f) => {
      let expected = 0;
      for (const comment of post().comments) {
        f.fields("comments", { model: comment }, (cf) => {
          expect(cf.index).toEqual(expected);
          expected += 1;
        });
      }
    });
  });

  it("nested fields index method with existing and new records on a nested attributes collection association", () => {
    post().comments = [new Comment(321), new Comment()];

    formWith({ model: post() }, (f) => {
      let expected = 0;
      for (const comment of post().comments) {
        f.fields("comments", { model: comment }, (cf) => {
          expect(cf.index).toEqual(expected);
          expected += 1;
        });
      }
    });
  });

  it("nested fields index method with existing records on a supplied nested attributes collection", () => {
    post().comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formWith({ model: post() }, (f) => {
      let expected = 0;
      f.fields("comments", { model: post().comments }, (cf) => {
        expect(cf.index).toEqual(expected);
        expected += 1;
      });
    });
  });

  it("nested fields index method with child index option override on a nested attributes collection association", () => {
    post().comments = [];

    formWith({ model: post() }, (f) => {
      f.fields("comments", { model: new Comment(321), childIndex: "abc" }, (cf) => {
        expect(cf.index).toEqual("abc");
      });
    });
  });

  it("nested fields uses unique indices for different collection associations", () => {
    post().comments = [new Comment(321)];
    (post() as unknown as { tags: Tag[] }).tags = [new Tag(123), new Tag(456)];
    const tags = (post() as unknown as { tags: Tag[] }).tags;
    post().comments[0].relevances = [];
    tags[0].relevances = [];
    tags[1].relevances = [];

    formWith({ model: post() }, (f) => {
      concat(
        f.fields("comments", { model: post().comments[0] }, (cf) => {
          concat(cf.textField("name"));
          concat(
            cf.fields("relevances", { model: new CommentRelevance(314) }, (crf) => {
              concat(crf.textField("value"));
            }),
          );
        }),
      );
      concat(
        f.fields("tags", { model: tags[0] }, (tf) => {
          concat(tf.textField("value"));
          concat(
            tf.fields("relevances", { model: new TagRelevance(3141) }, (trf) => {
              concat(trf.textField("value"));
            }),
          );
        }),
      );
      concat(
        f.fields("tags", { model: tags[1] }, (tf) => {
          concat(tf.textField("value"));
          concat(
            tf.fields("relevances", { model: new TagRelevance(31415) }, (trf) => {
              concat(trf.textField("value"));
            }),
          );
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[comments_attributes][0][name]" type="text" value="comment #321" id="post_comments_attributes_0_name" />' +
        '<input name="post[comments_attributes][0][relevances_attributes][0][value]" type="text" value="commentrelevance #314" id="post_comments_attributes_0_relevances_attributes_0_value" />' +
        '<input name="post[comments_attributes][0][relevances_attributes][0][id]" type="hidden" value="314" id="post_comments_attributes_0_relevances_attributes_0_id" autocomplete="off"/>' +
        '<input name="post[comments_attributes][0][id]" type="hidden" value="321" id="post_comments_attributes_0_id" autocomplete="off"/>' +
        '<input name="post[tags_attributes][0][value]" type="text" value="tag #123" id="post_tags_attributes_0_value"/>' +
        '<input name="post[tags_attributes][0][relevances_attributes][0][value]" type="text" value="tagrelevance #3141" id="post_tags_attributes_0_relevances_attributes_0_value"/>' +
        '<input name="post[tags_attributes][0][relevances_attributes][0][id]" type="hidden" value="3141" id="post_tags_attributes_0_relevances_attributes_0_id" autocomplete="off"/>' +
        '<input name="post[tags_attributes][0][id]" type="hidden" value="123" id="post_tags_attributes_0_id" autocomplete="off"/>' +
        '<input name="post[tags_attributes][1][value]" type="text" value="tag #456" id="post_tags_attributes_1_value"/>' +
        '<input name="post[tags_attributes][1][relevances_attributes][0][value]" type="text" value="tagrelevance #31415" id="post_tags_attributes_1_relevances_attributes_0_value"/>' +
        '<input name="post[tags_attributes][1][relevances_attributes][0][id]" type="hidden" value="31415" id="post_tags_attributes_1_relevances_attributes_0_id" autocomplete="off"/>' +
        '<input name="post[tags_attributes][1][id]" type="hidden" value="456" id="post_tags_attributes_1_id" autocomplete="off"/>',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with hash like model", () => {
    const author = new HashBackedAuthor();

    formWith({ model: post() }, (f) => {
      concat(
        f.fields("author", { model: author }, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[author_attributes][name]" type="text" value="hash backed author" id="post_author_attributes_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields with hash with indifferent access like model", () => {
    const author = new HashWithIndifferentAccessBackedAuthor();

    formWith({ model: post() }, (f) => {
      concat(
        f.fields("author", { model: author }, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () =>
        '<input name="post[author_attributes][name]" type="text" value="hash backed author" id="post_author_attributes_name" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("form with and fields", () => {
    formWith({ model: post(), scope: "post", id: "create-post" }, (postForm) => {
      concat(postForm.textField("title"));
      concat(postForm.textarea("body"));

      concat(
        view.fields("parent_post", { model: post() }, (parentFields) => {
          concat(parentFields.checkbox("secret"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      null,
      { method: "patch" },
      () =>
        "<input name='post[title]' type='text' value='Hello World' id='post_title' />" +
        "<textarea name='post[body]' id='post_body' >\nBack to the hill and over it again!</textarea>" +
        "<input name='parent_post[secret]' type='hidden' value='0' autocomplete='off' />" +
        "<input name='parent_post[secret]' checked='checked' type='checkbox' value='1' id='parent_post_secret' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with and fields with object", () => {
    formWith({ model: post(), scope: "post", id: "create-post" }, (postForm) => {
      concat(postForm.textField("title"));
      concat(postForm.textarea("body"));

      concat(
        postForm.fields({ model: comment }, (commentFields) => {
          concat(commentFields.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      null,
      { method: "patch" },
      () =>
        "<input name='post[title]' type='text' value='Hello World' id='post_title' />" +
        "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
        "<input name='post[comment][name]' type='text' value='new comment' id='post_comment_name' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form with and fields with non nested association and without object", () => {
    formWith({ model: post() }, (f) => {
      concat(
        f.fields("category", (c) => {
          concat(c.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      null,
      null,
      { method: "patch" },
      () => "<input name='post[category][name]' type='text' id='post_category_name' />",
    );

    assertDomEqual(expected, rendered);
  });

  class LabelledFormBuilder extends FormBuilderClass {
    static {
      for (const selector of this.fieldHelpers.filter((helper) => helper !== "hiddenField")) {
        const zuper = (
          FormBuilderClass.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
        )[selector];
        (this.prototype as unknown as Record<string, (...args: unknown[]) => unknown>)[selector] =
          function (this: FormBuilder, ...args: unknown[]) {
            return htmlSafe(
              `<label for='${String(args[0])}'>${humanize(String(args[0]))}:</label> ` +
                String(zuper.apply(this, args)) +
                "<br/>",
            );
          };
      }
    }
  }

  const labelledFields =
    "<label for='title'>Title:</label> <input name='post[title]' type='text' value='Hello World' id='post_title'/><br/>" +
    "<label for='body'>Body:</label> <textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea><br/>" +
    "<label for='secret'>Secret:</label> <input name='post[secret]' type='hidden' value='0' autocomplete='off' /><input name='post[secret]' checked='checked' type='checkbox' value='1' id='post_secret' /><br/>";

  it("form with with labelled builder", () => {
    formWith({ model: post(), builder: LabelledFormBuilder }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected = wholeForm("/posts/123", null, null, { method: "patch" }, () => labelledFields);

    assertDomEqual(expected, rendered);
  });

  it("default form builder", () => {
    const base = Base as unknown as { defaultFormBuilder: unknown };
    const oldDefaultFormBuilder = base.defaultFormBuilder;
    base.defaultFormBuilder = LabelledFormBuilder;
    try {
      formWith({ model: post() }, (f) => {
        concat(f.textField("title"));
        concat(f.textarea("body"));
        concat(f.checkbox("secret"));
      });

      const expected = wholeForm(
        "/posts/123",
        null,
        null,
        { method: "patch" },
        () => labelledFields,
      );

      assertDomEqual(expected, rendered);
    } finally {
      base.defaultFormBuilder = oldDefaultFormBuilder;
    }
  });

  const labelledTitle =
    "<label for='title'>Title:</label> <input name='post[title]' type='text' value='Hello World' id='post_title' /><br/>";

  it("lazy loading default form builder", () => {
    registerConstant("FormWithActsLikeFormForTest", { LabelledFormBuilder });
    const base = Base as unknown as { defaultFormBuilder: unknown };
    const oldDefaultFormBuilder = base.defaultFormBuilder;
    base.defaultFormBuilder = "FormWithActsLikeFormForTest::LabelledFormBuilder";
    try {
      formWith({ model: post() }, (f) => {
        concat(f.textField("title"));
      });

      const expected = wholeForm(
        "/posts/123",
        null,
        null,
        { method: "patch" },
        () => labelledTitle,
      );

      assertDomEqual(expected, rendered);
    } finally {
      base.defaultFormBuilder = oldDefaultFormBuilder;
    }
  });

  it("form builder override", () => {
    view.defaultFormBuilder = LabelledFormBuilder;

    rendered = view.fields("post", { model: post() }, (f) => {
      concat(f.textField("title"));
    });

    assertDomEqual(labelledTitle, rendered);
  });

  it("lazy loading form builder override", () => {
    registerConstant("FormWithActsLikeFormForTest", { LabelledFormBuilder });
    view.defaultFormBuilder = "FormWithActsLikeFormForTest::LabelledFormBuilder";

    rendered = view.fields("post", { model: post() }, (f) => {
      concat(f.textField("title"));
    });

    assertDomEqual(labelledTitle, rendered);
  });

  it("fields with labelled builder", () => {
    rendered = view.fields("post", { model: post(), builder: LabelledFormBuilder }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    assertDomEqual(labelledFields, rendered);
  });

  it("form with with labelled builder with nested fields without options hash", () => {
    let klass: unknown = null;

    formWith({ model: post(), builder: LabelledFormBuilder }, (f) => {
      f.fields("comments", { model: new Comment() }, (nestedFields) => {
        klass = nestedFields.constructor;
        return "";
      });
    });

    expect(klass).toBe(LabelledFormBuilder);
  });

  it("form with with labelled builder with nested fields with options hash", () => {
    let klass: unknown = null;

    formWith({ model: post(), builder: LabelledFormBuilder }, (f) => {
      f.fields("comments", { model: new Comment(), index: "foo" }, (nestedFields) => {
        klass = nestedFields.constructor;
        return "";
      });
    });

    expect(klass).toBe(LabelledFormBuilder);
  });

  it("form with with labelled builder path", () => {
    let path: unknown = null;

    formWith({ model: post(), builder: LabelledFormBuilder }, (f) => {
      path = f.toPartialPath();
      return "";
    });

    expect(path).toEqual("labelled_form");
  });

  class LabelledFormBuilderSubclass extends LabelledFormBuilder {}

  it("form with with labelled builder with nested fields with custom builder", () => {
    let klass: unknown = null;

    formWith({ model: post(), builder: LabelledFormBuilder }, (f) => {
      f.fields(
        "comments",
        { model: new Comment(), builder: LabelledFormBuilderSubclass },
        (nestedFields) => {
          klass = nestedFields.constructor;
          return "";
        },
      );
    });

    expect(klass).toBe(LabelledFormBuilderSubclass);
  });
});
