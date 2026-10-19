import "../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet } from "@blazetrails/actionpack";
import { Conversion, ModelName, Naming, Translation } from "@blazetrails/activemodel";
import {
  BigDecimal,
  HashWithIndifferentAccess,
  I18n,
  assertEqual,
  assertPredicate,
  assertRaises,
  extend,
  isBlank,
  htmlSafe,
  humanize,
  isHtmlSafe,
  isPlainObject,
  isPresent,
} from "@blazetrails/activesupport";
import { Date as RubyDate, DateTime } from "@blazetrails/date";
import { ArgumentError, Hash, Range, Struct, include } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";
import {
  FormBuilder,
  multipleFileFieldIncludeHidden,
  setMultipleFileFieldIncludeHidden,
} from "../helpers/form-helper.js";
import type { LabelBuilder } from "../helpers/tags/label.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

class Post {
  static {
    extend(this, Naming);
    include(this, Conversion);
    extend(this, Translation);
  }
  declare static humanAttributeName: (attribute: string) => string;

  title: unknown = null;
  author_name: unknown = null;
  body: unknown = null;
  secret: unknown = null;
  persisted: unknown = false;
  written_on: unknown = null;
  cost: unknown = null;
  author: unknown = null;
  comments: unknown = null;
  comment_ids: unknown = null;
  tags: unknown = null;
  errors = { get: (field: string) => (field === "author_name" ? ["can't be empty"] : []) };
  get ["secret?"](): unknown {
    return this.secret;
  }
  isPersisted(): unknown {
    return this.persisted;
  }
  set author_attributes(attributes: unknown) {}
  set comments_attributes(attributes: unknown) {}
  set tags_attributes(attributes: unknown) {}
}

class PostDelegator extends Post {
  toModel(): unknown {
    return new PostDelegate();
  }
}

class PostDelegate extends Post {
  static override humanAttributeName(attribute: string): string {
    return `Delegate ${super.humanAttributeName(attribute)}`;
  }

  get modelName(): ModelName {
    return new ModelName(this.constructor as never);
  }
}

class Comment {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  relevances: unknown = null;
  body: unknown = null;

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
    const name = this.constructor.name.toLowerCase();
    return this.id == null ? `new ${name}` : `${name} #${String(this.id)}`;
  }
  set relevances_attributes(attributes: unknown) {}
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

  constructor(
    public id: unknown = null,
    public post_id: unknown = null,
  ) {}

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

class HashBackedAuthor extends Hash {
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

class FakeAssociationProxy {
  toAry(): number[] {
    return [1, 2, 3];
  }
}

class Car {
  constructor(public color: string) {}
}

const Routes = new RouteSet();
Routes.draw(function () {
  this.resources("posts", () => {
    this.resources("comments");
  });
  this.root({ to: "main#index" });
});

type View = Base &
  Record<string, (...args: unknown[]) => unknown> & {
    post: Post;
    car: Car;
    post_delegator: PostDelegator;
  };

describe("FormHelperTest", () => {
  let view: View;
  let post: Post;
  let comment: Comment;
  let rendered: unknown;

  function formFor(...args: Parameters<Base["formFor"]>): unknown {
    return (rendered = view.formFor(...args));
  }

  function concat(string: unknown): unknown {
    return (view as unknown as { concat(string: unknown): unknown }).concat(string);
  }

  function hiddenFields(options: { method?: string; enforceUtf8?: boolean } = {}): string {
    const method = options.method;

    let txt = "";
    if (options.enforceUtf8 ?? true) {
      txt += `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;
    }

    if (method && !["get", "post"].includes(method)) {
      txt += `<input name="_method" type="hidden" value="${method}" autocomplete="off" />`;
    }

    return txt;
  }

  function formText(
    action: string | null = "/",
    id: string | null = null,
    htmlClass: string | null = null,
    remote: unknown = null,
    multipart: unknown = null,
    method: string | null = null,
  ): string {
    let txt = `<form accept-charset="UTF-8"` + (action ? ` action="${action}"` : "");
    if (multipart) txt += ` enctype="multipart/form-data"`;
    if (remote) txt += ` data-remote="true"`;
    if (htmlClass) txt += ` class="${htmlClass}"`;
    if (id) txt += ` id="${id}"`;
    method = method === "get" ? "get" : "post";
    return txt + ` method="${method}">`;
  }

  function wholeForm(
    action: string | null = "/",
    id: string | null = null,
    htmlClass: string | null = null,
    options: { method?: string; remote?: unknown; multipart?: unknown; enforceUtf8?: boolean } = {},
    block?: () => string,
  ): string {
    const contents = block ? block() : "";

    const { method, remote, multipart } = options;

    return (
      formText(action, id, htmlClass, remote, multipart, method) +
      hiddenFields({ method: options.method, enforceUtf8: options.enforceUtf8 }) +
      contents +
      "</form>"
    );
  }

  beforeEach(() => {
    I18n.backend().storeTranslations("label", {
      activemodel: {
        attributes: {
          post: { cost: "Total cost" },
          "post/language": { spanish: "Espanol" },
        },
      },
      helpers: {
        label: {
          post: {
            body: "Write entire text here",
            color: { red: "Rojo" },
            comments: { body: "Write body here" },
          },
          tag: { value: "Tag" },
          post_delegate: { title: "Delegate model_name title" },
        },
      },
    });
    I18n.backend().storeTranslations("placeholder", {
      helpers: { placeholder: { post: { title: "What is this about?" } } },
    });
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
    include(view.constructor as new (...args: never[]) => unknown, Routes.urlHelpers());
    const urlFor = view.urlFor;
    view.urlFor = function (this: Base, object: unknown): string {
      if (isPlainObject(object) && isBlank(object["useRoute"]) && isBlank(object["controller"])) {
        object["controller"] = "main";
        object["action"] = "index";
      }
      return urlFor.call(this, object);
    } as typeof view.urlFor;
    post = new Post();
    comment = new Comment();
    Object.assign(post, { toKey: () => [123], id: 0, toParam: () => "123" });
    post.persisted = true;
    post.title = "Hello World";
    post.author_name = "";
    post.body = "Back to the hill and over it again!";
    post.secret = 1;
    post.written_on = RubyDate.civil(2004, 6, 15);
    post.comments = [comment];
    post.tags = [new Tag()];
    view.post = post;
    view.car = new Car("#000FFF");
    const postDelegator = new PostDelegator();
    postDelegator.title = "Hello World";
    view.post_delegator = postDelegator;
  });

  afterEach(() => {
    I18n.reloadBang();
  });

  it("label", () => {
    assertDomEqual('<label for="post_title">Title</label>', view.label("post", "title"));
    assertDomEqual(
      '<label for="post_title">The title goes here</label>',
      view.label("post", "title", "The title goes here"),
    );
    assertDomEqual(
      '<label class="title_label" for="post_title">Title</label>',
      view.label("post", "title", null, { class: "title_label" }),
    );
    assertDomEqual('<label for="post_secret">Secret?</label>', view.label("post", "secret?"));
  });

  it("label with symbols", () => {
    assertDomEqual('<label for="post_title">Title</label>', view.label("post", "title"));
    assertDomEqual('<label for="post_secret">Secret?</label>', view.label("post", "secret?"));
  });

  it("label with locales strings", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        '<label for="post_body">Write entire text here</label>',
        view.label("post", "body"),
      );
    });
  });

  it("label with human attribute name", () => {
    I18n.withLocale("label", () => {
      assertDomEqual('<label for="post_cost">Total cost</label>', view.label("post", "cost"));
    });
  });

  it("label with human attribute name and options", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        '<label for="post_language_spanish">Espanol</label>',
        view.label("post", "language", { value: "spanish" }),
      );
    });
  });

  it("label with locales symbols", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        '<label for="post_body">Write entire text here</label>',
        view.label("post", "body"),
      );
    });
  });

  it("label with locales and options", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        '<label for="post_body" class="post_body">Write entire text here</label>',
        view.label("post", "body", { class: "post_body" }),
      );
    });
  });

  it("label with locales and value", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        '<label for="post_color_red">Rojo</label>',
        view.label("post", "color", { value: "red" }),
      );
    });
  });

  it("label with locales and nested attributes", () => {
    I18n.withLocale("label", () => {
      formFor(post, { html: { id: "create-post" } }, (f: FormBuilder) =>
        f.fieldsFor("comments", null, null, (cf) => concat(cf.label("body"))),
      );

      const expected = wholeForm(
        "/posts/123",
        "create-post",
        "edit_post",
        { method: "patch" },
        () => '<label for="post_comments_attributes_0_body">Write body here</label>',
      );

      assertDomEqual(expected, rendered);
    });
  });

  it("label with locales fallback and nested attributes", () => {
    I18n.withLocale("label", () => {
      formFor(post, { html: { id: "create-post" } }, (f: FormBuilder) =>
        f.fieldsFor("tags", null, null, (cf) => concat(cf.label("value"))),
      );

      const expected = wholeForm(
        "/posts/123",
        "create-post",
        "edit_post",
        { method: "patch" },
        () => '<label for="post_tags_attributes_0_value">Tag</label>',
      );

      assertDomEqual(expected, rendered);
    });
  });

  it("label with non active record object", () => {
    const Person = Struct.new("name");

    formFor(
      new Person("ok"),
      { as: "person", url: "/an", html: { id: "create-person" } },
      (f: FormBuilder) => f.label("name"),
    );

    const expected = wholeForm(
      "/an",
      "create-person",
      "new_person",
      { method: "post" },
      () => '<label for="person_name">Name</label>',
    );

    assertDomEqual(expected, rendered);
  });

  it("label with for attribute as symbol", () => {
    assertDomEqual(
      '<label for="my_for">Title</label>',
      view.label("post", "title", null, { for: "my_for" }),
    );
  });

  it("label with for attribute as string", () => {
    assertDomEqual(
      '<label for="my_for">Title</label>',
      view.label("post", "title", null, { for: "my_for" }),
    );
  });

  it("label does not generate for attribute when given nil", () => {
    assertDomEqual("<label>Title</label>", view.label("post", "title", { for: null }));
  });

  it("label with id attribute as symbol", () => {
    assertDomEqual(
      '<label for="post_title" id="my_id">Title</label>',
      view.label("post", "title", null, { id: "my_id" }),
    );
  });

  it("label with id attribute as string", () => {
    assertDomEqual(
      '<label for="post_title" id="my_id">Title</label>',
      view.label("post", "title", null, { id: "my_id" }),
    );
  });

  it("label with for and id attributes as symbol", () => {
    assertDomEqual(
      '<label for="my_for" id="my_id">Title</label>',
      view.label("post", "title", null, { for: "my_for", id: "my_id" }),
    );
  });

  it("label with for and id attributes as string", () => {
    assertDomEqual(
      '<label for="my_for" id="my_id">Title</label>',
      view.label("post", "title", null, { for: "my_for", id: "my_id" }),
    );
  });

  it("label for radio buttons with value", () => {
    assertDomEqual(
      '<label for="post_title_great_title">The title goes here</label>',
      view.label("post", "title", "The title goes here", { value: "great_title" }),
    );
    assertDomEqual(
      '<label for="post_title_great_title">The title goes here</label>',
      view.label("post", "title", "The title goes here", { value: "great title" }),
    );
  });

  it("label with block", () => {
    assertDomEqual(
      '<label for="post_title">The title, please:</label>',
      view.label("post", "title", null, null, () => "The title, please:"),
    );
  });

  it("label with block and html", () => {
    assertDomEqual(
      '<label for="post_terms">Accept <a href="/terms">Terms</a>.</label>',
      view.label("post", "terms", null, null, () => view.raw('Accept <a href="/terms">Terms</a>.')),
    );
  });

  it("label with block and options", () => {
    assertDomEqual(
      '<label for="my_for">The title, please:</label>',
      view.label("post", "title", { for: "my_for" }, null, () => "The title, please:"),
    );
  });

  it("label with block and builder", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        '<label for="post_body"><b>Write entire text here</b></label>',
        view.label("post", "body", null, null, (b: LabelBuilder) =>
          view.raw(`<b>${String(b.translation())}</b>`),
        ),
      );
    });
  });

  it("label with block in erb", async () => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    try {
      const erbView = Base.withEmptyTemplateCache().withViewPaths(
        [
          new FixtureResolver({
            "test/_label_with_block.html.tse":
              "<%= label('post', 'message', null, null, () => { %>\n" +
              "  Message\n" +
              "  <%= textField('post', 'message') %>\n" +
              "<% }) %>\n",
          }),
        ],
        {},
      );
      assertDomEqual(
        '<label for="post_message">\n  Message\n  <input id="post_message" name="post[message]" type="text" />\n</label>',
        await erbView.render("test/label_with_block"),
      );
    } finally {
      TemplateHandlers.clear();
    }
  });

  it("label with to model", () => {
    assertDomEqual(
      `<label for="post_delegator_title">Delegate Title</label>`,
      view.label("post_delegator", "title"),
    );
  });

  it("label with to model and overridden model name", () => {
    I18n.withLocale("label", () => {
      assertDomEqual(
        `<label for="post_delegator_title">Delegate model_name title</label>`,
        view.label("post_delegator", "title"),
      );
    });
  });

  it("text field placeholder without locales", () => {
    I18n.withLocale("placeholder", () => {
      assertDomEqual(
        '<input id="post_body" name="post[body]" placeholder="Body" type="text" value="Back to the hill and over it again!" />',
        view.textField("post", "body", { placeholder: true }),
      );
    });
  });

  it("text field placeholder with string value", () => {
    I18n.withLocale("placeholder", () => {
      assertDomEqual(
        '<input id="post_cost" name="post[cost]" placeholder="HOW MUCH?" type="text" />',
        view.textField("post", "cost", { placeholder: "HOW MUCH?" }),
      );
    });
  });

  it("text field", () => {
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="text" value="Hello World" />',
      view.textField("post", "title"),
    );
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="password" />',
      view.passwordField("post", "title"),
    );
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="password" value="Hello World" />',
      view.passwordField("post", "title", { value: post.title }),
    );
    assertDomEqual(
      '<input id="person_name" name="person[name]" type="password" />',
      view.passwordField("person", "name"),
    );
  });

  it("text field with escapes", () => {
    post.title = "<b>Hello World</b>";
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="text" value="&lt;b&gt;Hello World&lt;/b&gt;" />',
      view.textField("post", "title"),
    );
  });

  it("text field with html entities", () => {
    post.title = "The HTML Entity for & is &amp;";
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="text" value="The HTML Entity for &amp; is &amp;amp;" />',
      view.textField("post", "title"),
    );
  });

  it("text field with options", () => {
    const expected =
      '<input id="post_title" name="post[title]" size="35" type="text" value="Hello World" />';
    assertDomEqual(expected, view.textField("post", "title", { size: 35 }));
    assertDomEqual(expected, view.textField("post", "title", { size: 35 }));
  });

  it("text field assuming size", () => {
    const expected =
      '<input id="post_title" maxlength="35" name="post[title]" size="35" type="text" value="Hello World" />';
    assertDomEqual(expected, view.textField("post", "title", { maxlength: 35 }));
    assertDomEqual(expected, view.textField("post", "title", { maxlength: 35 }));
  });

  it("text field removing size", () => {
    const expected =
      '<input id="post_title" maxlength="35" name="post[title]" type="text" value="Hello World" />';
    assertDomEqual(expected, view.textField("post", "title", { maxlength: 35, size: null }));
    assertDomEqual(expected, view.textField("post", "title", { maxlength: 35, size: null }));
  });

  it("text field with nil value", () => {
    const expected = '<input id="post_title" name="post[title]" type="text" />';
    assertDomEqual(expected, view.textField("post", "title", { value: null }));
  });

  it("text field with nil name", () => {
    const expected = '<input id="post_title" type="text" value="Hello World" />';
    assertDomEqual(expected, view.textField("post", "title", { name: null }));
  });

  it("text field doesnt change param values", () => {
    const objectName = "post[]";
    const expected =
      '<input id="post_123_title" name="post[123][title]" type="text" value="Hello World" />';
    assertDomEqual(expected, view.textField(objectName, "title"));
  });

  it("file field has no size", () => {
    const expected = '<input id="user_avatar" name="user[avatar]" type="file" />';
    assertDomEqual(expected, view.fileField("user", "avatar"));
  });

  it("file field with multiple behavior", () => {
    const expected =
      '<input id="import_file" multiple="multiple" name="import[file][]" type="file" />';
    assertDomEqual(expected, view.fileField("import", "file", { multiple: true }));
  });

  it("file field with multiple behavior configured include hidden", () => {
    const oldValue = multipleFileFieldIncludeHidden;
    setMultipleFileFieldIncludeHidden(true);
    try {
      const expected =
        '<input type="hidden" name="import[file][]" autocomplete="off" value="">' +
        '<input id="import_file" multiple="multiple" name="import[file][]" type="file" />';
      assertDomEqual(expected, view.fileField("import", "file", { multiple: true }));
    } finally {
      setMultipleFileFieldIncludeHidden(oldValue);
    }
  });

  it("file field with multiple behavior include hidden false", () => {
    const expected =
      '<input id="import_file" multiple="multiple" name="import[file][]" type="file" />';
    assertDomEqual(
      expected,
      view.fileField("import", "file", { multiple: true, includeHidden: false }),
    );
  });

  it("file field with multiple behavior and explicit name", () => {
    const expected = '<input id="import_file" multiple="multiple" name="custom" type="file" />';
    assertDomEqual(expected, view.fileField("import", "file", { multiple: true, name: "custom" }));
  });

  it("file field with multiple behavior and explicit name configured include hidden", () => {
    const oldValue = multipleFileFieldIncludeHidden;
    setMultipleFileFieldIncludeHidden(true);
    try {
      const expected =
        '<input type="hidden" name="custom" autocomplete="off" value="">' +
        '<input id="import_file" multiple="multiple" name="custom" type="file" />';
      assertDomEqual(
        expected,
        view.fileField("import", "file", { multiple: true, name: "custom" }),
      );
    } finally {
      setMultipleFileFieldIncludeHidden(oldValue);
    }
  });

  it("file field with direct upload when rails direct uploads url is not defined", () => {
    const expected = '<input type="file" name="import[file]" id="import_file" />';
    assertDomEqual(expected, view.fileField("import", "file", { directUpload: true }));
  });

  // BLOCKED: actionview-tests-needing-actionpack-controller-and-parameters
  it.skip("file field with direct upload when rails direct uploads url is defined", () => {});

  it("file field with direct upload dont mutate arguments", () => {
    const originalOptions = { class: "pix", directUpload: true };

    const expected = '<input class="pix" type="file" name="import[file]" id="import_file" />';
    assertDomEqual(expected, view.fileField("import", "file", originalOptions));

    assertEqual({ class: "pix", directUpload: true }, originalOptions);
  });

  it("hidden field", () => {
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="hidden" value="Hello World" autocomplete="off" />',
      view.hiddenField("post", "title"),
    );
    assertDomEqual(
      '<input id="post_secret" name="post[secret]" type="hidden" value="1" autocomplete="off" />',
      view.hiddenField("post", "secret?"),
    );
  });

  it("hidden field with escapes", () => {
    post.title = "<b>Hello World</b>";
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="hidden" value="&lt;b&gt;Hello World&lt;/b&gt;" autocomplete="off" />',
      view.hiddenField("post", "title"),
    );
  });

  it("hidden field with nil value", () => {
    const expected =
      '<input id="post_title" name="post[title]" type="hidden" autocomplete="off" />';
    assertDomEqual(expected, view.hiddenField("post", "title", { value: null }));
  });

  it("hidden field with options", () => {
    assertDomEqual(
      '<input id="post_title" name="post[title]" type="hidden" value="Something Else" autocomplete="off" />',
      view.hiddenField("post", "title", { value: "Something Else" }),
    );
  });

  it("text field with custom type", () => {
    assertDomEqual(
      '<input id="user_email" name="user[email]" type="email" />',
      view.textField("user", "email", { type: "email" }),
    );
  });

  it("checkbox is html safe", () => {
    assertPredicate(view.checkbox("post", "secret"), isHtmlSafe);
  });

  it("checkbox checked if object value is same that check value", () => {
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret"),
    );
  });

  it("checkbox not checked if object value is same that unchecked value", () => {
    post.secret = 0;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret"),
    );
  });

  it("checkbox checked if option checked is present", () => {
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret", { checked: "checked" }),
    );
  });

  it("checkbox checked if object value is true", () => {
    post.secret = true;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret"),
    );

    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret?"),
    );
  });

  it("checkbox checked if object value includes checked value", () => {
    post.secret = ["0"];
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret"),
    );

    post.secret = ["1"];
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret"),
    );

    post.secret = new Set(["1"]);
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret"),
    );
  });

  it("checkbox with include hidden false", () => {
    post.secret = false;
    assertDomEqual(
      '<input id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret", { includeHidden: false }),
    );
  });

  it("checkbox with explicit checked and unchecked values when object value is string", () => {
    post.secret = "on";
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="off" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="on" />',
      view.checkbox("post", "secret", {}, "on", "off"),
    );

    post.secret = "off";
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="off" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="on" />',
      view.checkbox("post", "secret", {}, "on", "off"),
    );
  });

  it("checkbox with explicit checked and unchecked values when object value is boolean", () => {
    post.secret = false;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="true" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="false" />',
      view.checkbox("post", "secret", {}, false, true),
    );

    post.secret = true;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="true" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="false" />',
      view.checkbox("post", "secret", {}, false, true),
    );
  });

  it("checkbox with explicit checked and unchecked values when object value is integer", () => {
    post.secret = 0;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );

    post.secret = 1;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );

    post.secret = 2;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );
  });

  it("checkbox with explicit checked and unchecked values when object value is float", () => {
    post.secret = 0.0;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );

    post.secret = 1.1;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );

    post.secret = 2.2;
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );
  });

  it("checkbox with explicit checked and unchecked values when object value is big decimal", () => {
    post.secret = new BigDecimal(0);
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );

    post.secret = new BigDecimal(1);
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );

    post.secret = new BigDecimal(2.2, 1);
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="1" autocomplete="off" /><input id="post_secret" name="post[secret]" type="checkbox" value="0" />',
      view.checkbox("post", "secret", {}, 0, 1),
    );
  });

  it("checkbox with nil unchecked value", () => {
    post.secret = "on";
    assertDomEqual(
      '<input checked="checked" id="post_secret" name="post[secret]" type="checkbox" value="on" />',
      view.checkbox("post", "secret", {}, "on", null),
    );
  });

  it("checkbox with nil unchecked value is html safe", () => {
    assertPredicate(view.checkbox("post", "secret", {}, "on", null), isHtmlSafe);
  });

  it("checkbox with multiple behavior", () => {
    post.comment_ids = [2, 3];
    assertDomEqual(
      '<input name="post[comment_ids][]" type="hidden" value="0" autocomplete="off" /><input id="post_comment_ids_1" name="post[comment_ids][]" type="checkbox" value="1" />',
      view.checkbox("post", "comment_ids", { multiple: true }, 1),
    );
    assertDomEqual(
      '<input name="post[comment_ids][]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_comment_ids_3" name="post[comment_ids][]" type="checkbox" value="3" />',
      view.checkbox("post", "comment_ids", { multiple: true }, 3),
    );
  });

  it("checkbox with multiple behavior and index", () => {
    post.comment_ids = [2, 3];
    assertDomEqual(
      '<input name="post[foo][comment_ids][]" type="hidden" value="0" autocomplete="off" /><input id="post_foo_comment_ids_1" name="post[foo][comment_ids][]" type="checkbox" value="1" />',
      view.checkbox("post", "comment_ids", { multiple: true, index: "foo" }, 1),
    );
    assertDomEqual(
      '<input name="post[bar][comment_ids][]" type="hidden" value="0" autocomplete="off" /><input checked="checked" id="post_bar_comment_ids_3" name="post[bar][comment_ids][]" type="checkbox" value="3" />',
      view.checkbox("post", "comment_ids", { multiple: true, index: "bar" }, 3),
    );
  });

  it("checkbox disabled disables hidden field", () => {
    assertDomEqual(
      '<input name="post[secret]" type="hidden" value="0" disabled="disabled" autocomplete="off"/><input checked="checked" disabled="disabled" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret", { disabled: true }),
    );
  });

  it("checkbox form html5 attribute", () => {
    assertDomEqual(
      '<input form="new_form" name="post[secret]" type="hidden" value="0" autocomplete="off" /><input checked="checked" form="new_form" id="post_secret" name="post[secret]" type="checkbox" value="1" />',
      view.checkbox("post", "secret", { form: "new_form" }),
    );
  });

  it("radio button", () => {
    assertDomEqual(
      '<input checked="checked" id="post_title_hello_world" name="post[title]" type="radio" value="Hello World" />',
      view.radioButton("post", "title", "Hello World"),
    );
    assertDomEqual(
      '<input id="post_title_goodbye_world" name="post[title]" type="radio" value="Goodbye World" />',
      view.radioButton("post", "title", "Goodbye World"),
    );
    assertDomEqual(
      '<input id="item_subobject_title_inside_world" name="item[subobject][title]" type="radio" value="inside world"/>',
      view.radioButton("item[subobject]", "title", "inside world"),
    );
  });

  it("radio button is checked with integers", () => {
    assertDomEqual(
      '<input checked="checked" id="post_secret_1" name="post[secret]" type="radio" value="1" />',
      view.radioButton("post", "secret", "1"),
    );
  });

  it("radio button with negative integer value", () => {
    assertDomEqual(
      '<input id="post_secret_-1" name="post[secret]" type="radio" value="-1" />',
      view.radioButton("post", "secret", "-1"),
    );
  });

  it("radio button respects passed in id", () => {
    assertDomEqual(
      '<input checked="checked" id="foo" name="post[secret]" type="radio" value="1" />',
      view.radioButton("post", "secret", "1", { id: "foo" }),
    );
  });

  it("radio button with booleans", () => {
    assertDomEqual(
      '<input id="post_secret_true" name="post[secret]" type="radio" value="true" />',
      view.radioButton("post", "secret", true),
    );

    assertDomEqual(
      '<input id="post_secret_false" name="post[secret]" type="radio" value="false" />',
      view.radioButton("post", "secret", false),
    );
  });

  it("textarea placeholder without locales", () => {
    I18n.withLocale("placeholder", () => {
      assertDomEqual(
        '<textarea id="post_body" name="post[body]" placeholder="Body">\nBack to the hill and over it again!</textarea>',
        view.textarea("post", "body", { placeholder: true }),
      );
    });
  });

  it("textarea", () => {
    assertDomEqual(
      '<textarea id="post_body" name="post[body]">\nBack to the hill and over it again!</textarea>',
      view.textarea("post", "body"),
    );
  });

  it("textarea with escapes", () => {
    post.body = "Back to <i>the</i> hill and over it again!";
    assertDomEqual(
      '<textarea id="post_body" name="post[body]">\nBack to &lt;i&gt;the&lt;/i&gt; hill and over it again!</textarea>',
      view.textarea("post", "body"),
    );
  });

  it("textarea with alternate value", () => {
    assertDomEqual(
      '<textarea id="post_body" name="post[body]">\nTesting alternate values.</textarea>',
      view.textarea("post", "body", { value: "Testing alternate values." }),
    );
  });

  it("textarea with nil alternate value", () => {
    assertDomEqual(
      '<textarea id="post_body" name="post[body]">\n</textarea>',
      view.textarea("post", "body", { value: null }),
    );
  });

  it("textarea with html entities", () => {
    post.body = "The HTML Entity for & is &amp;";
    assertDomEqual(
      '<textarea id="post_body" name="post[body]">\nThe HTML Entity for &amp; is &amp;amp;</textarea>',
      view.textarea("post", "body"),
    );
  });

  it("textarea with size option", () => {
    assertDomEqual(
      '<textarea cols="183" id="post_body" name="post[body]" rows="820">\nBack to the hill and over it again!</textarea>',
      view.textarea("post", "body", { size: "183x820" }),
    );
  });

  it("color field with valid hex color string", () => {
    const expected = '<input id="car_color" name="car[color]" type="color" value="#000fff" />';
    assertDomEqual(expected, view.colorField("car", "color"));
  });

  it("color field with invalid hex color string", () => {
    const expected = '<input id="car_color" name="car[color]" type="color" value="#000000" />';
    view.car.color = "#1234TR";
    assertDomEqual(expected, view.colorField("car", "color"));
  });

  it("color field with value attr", () => {
    const expected = '<input id="car_color" name="car[color]" type="color" value="#00FF00" />';
    assertDomEqual(expected, view.colorField("car", "color", { value: "#00FF00" }));
  });

  it("search field", () => {
    const expected = '<input id="contact_notes_query" name="contact[notes_query]" type="search" />';
    assertDomEqual(expected, view.searchField("contact", "notes_query"));
  });

  it("search field with onsearch value", () => {
    const expected =
      '<input onsearch="true" type="search" name="contact[notes_query]" id="contact_notes_query" incremental="true" />';
    assertDomEqual(expected, view.searchField("contact", "notes_query", { onsearch: true }));
  });

  it("telephone field", () => {
    const expected = '<input id="user_cell" name="user[cell]" type="tel" />';
    assertDomEqual(expected, view.telephoneField("user", "cell"));
  });

  it("date field", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="date" value="2004-06-15" />';
    assertDomEqual(expected, view.dateField("post", "written_on"));
  });

  it("date field with datetime value", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="date" value="2004-06-15" />';
    post.written_on = DateTime.civil(2004, 6, 15, 1, 2, 3);
    assertDomEqual(expected, view.dateField("post", "written_on"));
  });

  it("date field with extra attrs", () => {
    const expected =
      '<input id="post_written_on" step="2" max="2010-08-15" min="2000-06-15" name="post[written_on]" type="date" value="2004-06-15" />';
    post.written_on = DateTime.civil(2004, 6, 15);
    const minValue = DateTime.civil(2000, 6, 15);
    const maxValue = DateTime.civil(2010, 8, 15);
    const step = 2;
    assertDomEqual(
      expected,
      view.dateField("post", "written_on", { min: minValue, max: maxValue, step: step }),
    );
  });

  it("date field with value attr", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="date" value="2013-06-29" />';
    const value = RubyDate.civil(2013, 6, 29);
    assertDomEqual(expected, view.dateField("post", "written_on", { value: value }));
  });

  it("date field with nil value", () => {
    const expected = '<input id="post_written_on" name="post[written_on]" type="date" />';
    post.written_on = null;
    assertDomEqual(expected, view.dateField("post", "written_on"));
  });

  it("date field with string values for min and max", () => {
    const expected =
      '<input id="post_written_on" max="2010-08-15" min="2000-06-15" name="post[written_on]" type="date" value="2004-06-15" />';
    post.written_on = DateTime.civil(2004, 6, 15);
    const minValue = "2000-06-15";
    const maxValue = "2010-08-15";
    assertDomEqual(
      expected,
      view.dateField("post", "written_on", { min: minValue, max: maxValue }),
    );
  });

  it("date field with invalid string values for min and max", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="date" value="2004-06-15" />';
    post.written_on = DateTime.civil(2004, 6, 15, 1, 2, 3);
    const minValue = "foo";
    const maxValue = "bar";
    assertDomEqual(
      expected,
      view.dateField("post", "written_on", { min: minValue, max: maxValue }),
    );
  });

  it("time field", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="time" value="00:00:00.000" />';
    assertDomEqual(expected, view.timeField("post", "written_on"));
  });

  it("time field without seconds", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="time" value="01:02" max="10:25" min="20:45" />';
    post.written_on = DateTime.civil(2004, 6, 15, 1, 2, 3);
    const minValue = DateTime.civil(2000, 6, 15, 20, 45, 30);
    const maxValue = DateTime.civil(2010, 8, 15, 10, 25, 0);
    assertDomEqual(
      expected,
      view.timeField("post", "written_on", { includeSeconds: false, min: minValue, max: maxValue }),
    );
  });

  it("datetime field", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="datetime-local" value="2004-06-15T00:00:00" />';
    assertDomEqual(expected, view.datetimeField("post", "written_on"));
  });

  it("datetime local field without seconds", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="datetime-local" value="2004-06-15T00:00" />';
    assertDomEqual(
      expected,
      view.datetimeLocalField("post", "written_on", { includeSeconds: false }),
    );
  });

  it("month field", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="month" value="2004-06" />';
    assertDomEqual(expected, view.monthField("post", "written_on"));
  });

  it("month field with nil value", () => {
    const expected = '<input id="post_written_on" name="post[written_on]" type="month" />';
    post.written_on = null;
    assertDomEqual(expected, view.monthField("post", "written_on"));
  });

  it("week field", () => {
    const expected =
      '<input id="post_written_on" name="post[written_on]" type="week" value="2004-W25" />';
    assertDomEqual(expected, view.weekField("post", "written_on"));
  });

  it("week field with nil value", () => {
    const expected = '<input id="post_written_on" name="post[written_on]" type="week" />';
    post.written_on = null;
    assertDomEqual(expected, view.weekField("post", "written_on"));
  });

  it("url field", () => {
    const expected = '<input id="user_homepage" name="user[homepage]" type="url" />';
    assertDomEqual(expected, view.urlField("user", "homepage"));
  });

  it("email field", () => {
    const expected = '<input id="user_address" name="user[address]" type="email" />';
    assertDomEqual(expected, view.emailField("user", "address"));
  });

  it("number field", () => {
    let expected =
      '<input name="order[quantity]" max="9" id="order_quantity" type="number" min="1" />';
    assertDomEqual(expected, view.numberField("order", "quantity", { in: new Range(1, 10, true) }));
    expected =
      '<input name="order[quantity]" size="30" max="9" id="order_quantity" type="number" min="1" />';
    assertDomEqual(
      expected,
      view.numberField("order", "quantity", { size: 30, in: new Range(1, 10, true) }),
    );
  });

  it("range input", () => {
    let expected =
      '<input name="hifi[volume]" step="0.1" max="11" id="hifi_volume" type="range" min="0" />';
    assertDomEqual(
      expected,
      view.rangeField("hifi", "volume", { in: new Range(0, 11), step: 0.1 }),
    );
    expected =
      '<input name="hifi[volume]" step="0.1" size="30" max="11" id="hifi_volume" type="range" min="0" />';
    assertDomEqual(
      expected,
      view.rangeField("hifi", "volume", { size: 30, in: new Range(0, 11), step: 0.1 }),
    );
  });

  it("field id with model", () => {
    const value = view.fieldId(new Post(), "title");

    expect(value).toBe("post_title");
  });

  it("field id with predicate method", () => {
    const value = view.fieldId(new Post(), "secret?");

    expect(value).toBe("post_secret");
  });

  function tag(): { span(content: unknown, options: Record<string, unknown>): unknown } {
    return view.tag() as unknown as ReturnType<typeof tag>;
  }

  const editPost = (block: () => string) =>
    wholeForm("/posts/123", "edit_post_123", "edit_post", { method: "patch" }, block);
  const titleInput = '<input name="post[title]" type="text" id="post_title" value="Hello World" />';
  const authorName =
    '<input id="post_author_attributes_name" name="post[author_attributes][name]" type="text" value="author #321" />';
  const authorId =
    '<input id="post_author_attributes_id" name="post[author_attributes][id]" type="hidden" value="321" autocomplete="off" />';
  const commentName = (i: number, value: string) =>
    `<input id="post_comments_attributes_${i}_name" name="post[comments_attributes][${i}][name]" type="text" value="${value}" />`;
  const commentId = (i: number, value: number) =>
    `<input id="post_comments_attributes_${i}_id" name="post[comments_attributes][${i}][id]" type="hidden" value="${value}" autocomplete="off" />`;

  it("form for requires block", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      formFor(post, { html: { id: "create-post" } });
    });
    assertEqual("Missing block", error.message);
  });

  it("form for requires arguments", async () => {
    let error = await assertRaises([ArgumentError], {}, () => {
      formFor(null, { html: { id: "create-post" } }, () => {});
    });
    assertEqual("First argument in form cannot contain nil or be empty", error.message);

    error = await assertRaises([ArgumentError], {}, () => {
      formFor([null, null], { html: { id: "create-post" } }, () => {});
    });
    assertEqual("First argument in form cannot contain nil or be empty", error.message);
  });

  it("form for text area alias", () => {
    formFor(post, { html: { id: "create-post" } }, (f) => {
      concat(f.textArea("body"));
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      "edit_post",
      { method: "patch" },
      () =>
        "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>",
    );

    assertDomEqual(expected, rendered);
  });

  it("form for with file field generate multipart", () => {
    formFor(post, { html: { id: "create-post" } }, (f) => {
      concat(f.fileField("file"));
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      "edit_post",
      { method: "patch", multipart: true },
      () => "<input name='post[file]' type='file' id='post_file' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form for false url", () => {
    formFor(new Post(), { url: false }, () => {});

    assertDomEqual(wholeForm(null, "new_post", "new_post"), rendered);
  });

  it("form for false action", () => {
    formFor(new Post(), { html: { action: false } }, () => {});

    assertDomEqual(wholeForm(null, "new_post", "new_post"), rendered);
  });

  it("form for field id", () => {
    formFor(new Post(), {}, (form) => {
      concat(form.label("title"));
      concat(form.textField("title", { aria: { describedby: form.fieldId("title", "error") } }));
      concat(tag().span("is blank", { id: form.fieldId("title", "error") }));
    });

    const expected = wholeForm(
      "/posts",
      "new_post",
      "new_post",
      {},
      () =>
        '<label for="post_title">Title</label>' +
        '<input id="post_title" name="post[title]" type="text" aria-describedby="post_title_error">' +
        '<span id="post_title_error">is blank</span>',
    );

    assertDomEqual(expected, rendered);
  });

  it("form for field id with index", () => {
    formFor(new Post(), { index: 1 }, (form) => {
      concat(form.textField("title", { aria: { describedby: form.fieldId("title", "error") } }));
      concat(tag().span("is blank", { id: form.fieldId("title", "error") }));
    });

    const expected = wholeForm(
      "/posts",
      "new_post",
      "new_post",
      {},
      () =>
        '<input id="post_1_title" name="post[1][title]" type="text" aria-describedby="post_1_title_error">' +
        '<span id="post_1_title_error">is blank</span>',
    );

    assertDomEqual(expected, rendered);
  });

  it("form for field name with blank as", () => {
    formFor(new Post(), { as: "" }, (form) => {
      concat(form.textField("title", { name: form.fieldName("title") }));
    });

    const expected = wholeForm(
      "/posts",
      "new_",
      "new_",
      {},
      () => '<input id="title" name="title" type="text">',
    );

    assertDomEqual(expected, rendered);
  });

  it("form for field id with namespace", () => {
    formFor(new Post(), { namespace: "special" }, (form) => {
      concat(form.label("title"));
      concat(form.textField("title", { aria: { describedby: form.fieldId("title", "error") } }));
      concat(tag().span("is blank", { id: form.fieldId("title", "error") }));
    });

    const expected = wholeForm(
      "/posts",
      "special_new_post",
      "new_post",
      {},
      () =>
        '<label for="special_post_title">Title</label>' +
        '<input id="special_post_title" name="post[title]" type="text" aria-describedby="special_post_title_error">' +
        '<span id="special_post_title_error">is blank</span>',
    );

    assertDomEqual(expected, rendered);
  });

  it("form for field name with blank as and multiple", () => {
    formFor(new Post(), { as: "" }, (form) => {
      concat(form.textField("title", { name: form.fieldName("title", { multiple: true }) }));
    });

    const expected = wholeForm(
      "/posts",
      "new_",
      "new_",
      {},
      () => '<input id="title" name="title[]" type="text">',
    );

    assertDomEqual(expected, rendered);
  });

  function assertFieldNameForm(
    options: Record<string, unknown>,
    fieldName: (form: FormBuilder) => string,
    expectedInput: string,
  ): void {
    formFor(new Post(), options, (form) => {
      concat(form.textField("title", { name: fieldName(form) }));
    });

    assertDomEqual(
      wholeForm("/posts", "new_post", "new_post", {}, () => expectedInput),
      rendered,
    );
  }

  it("form for field name without method names or multiple or index", () => {
    assertFieldNameForm(
      {},
      (form) => form.fieldName("title"),
      '<input id="post_title" name="post[title]" type="text">',
    );
  });

  it("form for field name without method names and multiple", () => {
    assertFieldNameForm(
      {},
      (form) => form.fieldName("title", { multiple: true }),
      '<input id="post_title" name="post[title][]" type="text">',
    );
  });

  it("form for field name without method names and index", () => {
    assertFieldNameForm(
      { index: 1 },
      (form) => form.fieldName("title"),
      '<input id="post_1_title" name="post[1][title]" type="text">',
    );
  });

  it("form for field name without method names and index and multiple", () => {
    assertFieldNameForm(
      { index: 1 },
      (form) => form.fieldName("title", { multiple: true }),
      '<input id="post_1_title" name="post[1][title][]" type="text">',
    );
  });

  it("form for field name with method names", () => {
    assertFieldNameForm(
      {},
      (form) => form.fieldName("title", "subtitle"),
      '<input id="post_title" name="post[title][subtitle]" type="text">',
    );
  });

  it("form for field name with method names and index", () => {
    assertFieldNameForm(
      { index: 1 },
      (form) => form.fieldName("title", "subtitle"),
      '<input id="post_1_title" name="post[1][title][subtitle]" type="text">',
    );
  });

  it("form for field name with method names and multiple", () => {
    assertFieldNameForm(
      {},
      (form) => form.fieldName("title", "subtitle", { multiple: true }),
      '<input id="post_title" name="post[title][subtitle][]" type="text">',
    );
  });

  it("form for field name with method names and multiple and index", () => {
    assertFieldNameForm(
      { index: 1 },
      (form) => form.fieldName("title", "subtitle", { multiple: true }),
      '<input id="post_1_title" name="post[1][title][subtitle][]" type="text">',
    );
  });

  it("form for field id with namespace and index", () => {
    formFor(new Post(), { namespace: "special", index: 1 }, (form) => {
      concat(form.textField("title", { aria: { describedby: form.fieldId("title", "error") } }));
      concat(tag().span("is blank", { id: form.fieldId("title", "error") }));
    });

    const expected = wholeForm(
      "/posts",
      "special_new_post",
      "new_post",
      {},
      () =>
        '<input id="special_post_1_title" name="post[1][title]" type="text" aria-describedby="special_post_1_title_error">' +
        '<span id="special_post_1_title_error">is blank</span>',
    );

    assertDomEqual(expected, rendered);
  });

  function assertNestedAttributesField(
    call: (commentForm: FormBuilder) => unknown,
    expectedText: string,
  ): void {
    const [post, comment, tag] = [new Post(), new Comment(), new Tag()];
    comment.relevances = [tag];
    post.comments = [comment];
    formFor(post, {}, (form) => {
      return form.fieldsFor("comments", null, null, (commentForm) => {
        concat(call(commentForm));
      });
    });

    assertDomEqual(
      wholeForm("/posts", "new_post", "new_post", {}, () => expectedText),
      rendered,
    );
  }

  it("form for with nested attributes field id", () => {
    assertNestedAttributesField(
      (f) => f.fieldId("relevances_attributes"),
      "post_comments_attributes_0_relevances_attributes",
    );
  });

  it("form for with nested attributes field name", () => {
    assertNestedAttributesField(
      (f) => f.fieldName("relevances_attributes"),
      "post[comments_attributes][0][relevances_attributes]",
    );
  });

  it("form for with nested attributes field name multiple", () => {
    assertNestedAttributesField(
      (f) => f.fieldName("relevances_attributes", { multiple: true }),
      "post[comments_attributes][0][relevances_attributes][]",
    );
  });

  it("button with method name", () => {
    formFor(post, {}, (f) => {
      concat(f.button(":secret", { value: true }));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_post_123",
      "edit_post",
      { method: "patch" },
      () =>
        `<button type="submit" id="post_secret" name="post[secret]" value="true">Update Post</button>`,
    );

    assertDomEqual(expected, rendered);
  });

  it("button with method name and attributes", () => {
    formFor(post, {}, (f) => {
      concat(
        f.button(":secret", { value: true, id: "not_generated", name: "post[not_generated]" }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_post_123",
      "edit_post",
      { method: "patch" },
      () =>
        `<button type="submit" id="not_generated" name="post[not_generated]" value="true">Update Post</button>`,
    );

    assertDomEqual(expected, rendered);
  });

  it("button with method name and block", () => {
    formFor(post, {}, (f) => {
      concat(f.button(":secret", { value: true }, () => "Update secret Post"));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_post_123",
      "edit_post",
      { method: "patch" },
      () =>
        `<button type="submit" id="post_secret" name="post[secret]" value="true">Update secret Post</button>`,
    );

    assertDomEqual(expected, rendered);
  });

  it("button with get formmethod attribute", () => {
    formFor(post, { as: "another_post" }, (f) => {
      concat(f.button("GET", { formmethod: "get" }));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_another_post",
      "edit_another_post",
      { method: "patch" },
      () => "<button type='submit' formmethod='get' name='button'>GET</button>",
    );

    assertDomEqual(expected, rendered);
  });

  it("button with post formmethod attribute", () => {
    formFor(post, { as: "another_post" }, (f) => {
      concat(f.button("POST", { formmethod: "post" }));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_another_post",
      "edit_another_post",
      { method: "patch" },
      () => "<button type='submit' formmethod='post' name='button'>POST</button>",
    );

    assertDomEqual(expected, rendered);
  });

  it("button with other formmethod attribute", () => {
    formFor(post, { as: "another_post" }, (f) => {
      concat(f.button("Delete", { formmethod: "delete" }));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_another_post",
      "edit_another_post",
      { method: "patch" },
      () => "<button type='submit' formmethod='post' name='_method' value='delete'>Delete</button>",
    );

    assertDomEqual(expected, rendered);
  });

  it("button with other formmethod attribute and name", () => {
    formFor(post, { as: "another_post" }, (f) => {
      concat(f.button("Delete", { formmethod: "delete", name: "existing" }));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_another_post",
      "edit_another_post",
      { method: "patch" },
      () => "<button type='submit' formmethod='delete' name='existing'>Delete</button>",
    );

    assertDomEqual(expected, rendered);
  });

  it("button with other formmethod attribute and value", () => {
    formFor(post, { as: "another_post" }, (f) => {
      concat(f.button("Delete", { formmethod: "delete", value: "existing" }));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_another_post",
      "edit_another_post",
      { method: "patch" },
      () =>
        "<button type='submit' formmethod='delete' name='button' value='existing'>Delete</button>",
    );

    assertDomEqual(expected, rendered);
  });

  class LabelledFormBuilder extends FormBuilder {
    static {
      for (const selector of this.fieldHelpers.filter((helper) => helper !== "hiddenField")) {
        const zuper = (
          FormBuilder.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
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

  it("default form builder", () => {
    const base = Base as unknown as { defaultFormBuilder: unknown };
    const oldDefaultFormBuilder = base.defaultFormBuilder;
    base.defaultFormBuilder = LabelledFormBuilder;
    try {
      formFor(post, {}, (f) => {
        concat(f.textField("title"));
        concat(f.textarea("body"));
        concat(f.checkbox("secret"));
      });

      const expected = editPost(
        () =>
          "<label for='title'>Title:</label> <input name='post[title]' type='text' id='post_title' value='Hello World' /><br/>" +
          "<label for='body'>Body:</label> <textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea><br/>" +
          "<label for='secret'>Secret:</label> <input name='post[secret]' type='hidden' value='0' autocomplete='off' /><input name='post[secret]' checked='checked' type='checkbox' id='post_secret' value='1' /><br/>",
      );

      assertDomEqual(expected, rendered);
    } finally {
      base.defaultFormBuilder = oldDefaultFormBuilder;
    }
  });

  it("form builder override", () => {
    view.defaultFormBuilder = LabelledFormBuilder;

    rendered = view.fieldsFor("post", post, {}, (f) => {
      concat(f.textField("title"));
    });

    const expected =
      "<label for='title'>Title:</label> <input name='post[title]' type='text' id='post_title' value='Hello World' /><br/>";

    assertDomEqual(expected, rendered);
  });

  it("nested fields for", () => {
    comment.body = "Hello World";
    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor(comment, null, null, (c) => {
          concat(c.textField("body"));
        }),
      );
    });

    const expected = editPost(
      () =>
        "<input name='post[comment][body]' type='text' id='post_comment_body' value='Hello World' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for field id", () => {
    formFor(post, {}, (form) => {
      concat(
        form.fieldsFor("comment_attributes", comment, null, (c) => {
          concat(c.fieldId("body"));
        }),
      );
    });

    assertDomEqual(
      editPost(() => "post_comment_attributes_body"),
      rendered,
    );
  });

  it("nested fields for field id with index override", () => {
    formFor(post, {}, (form) => {
      concat(
        form.fieldsFor("comment_attributes", comment, { index: 1 }, (c) => {
          concat(c.fieldId("body"));
        }),
      );
    });

    assertDomEqual(
      editPost(() => "post_comment_attributes_1_body"),
      rendered,
    );
  });

  it("deep nested fields for", () => {
    comment.save();
    formFor("posts", {}, (f) => {
      return f.fieldsFor("post[]", post, null, (f2) => {
        f2.textField("id");
        for (const comment of post.comments as Comment[]) {
          concat(
            f2.fieldsFor("comment[]", comment, null, (c) => {
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
        "<input name='posts[post][0][comment][1][name]' type='text' id='posts_post_0_comment_1_name' value='comment #1' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with index and parent fields", () => {
    formFor(post, { index: 1 }, (c) => {
      concat(c.textField("title"));
      concat(
        c.fieldsFor("comment", comment, { index: 1 }, (r) => {
          concat(r.textField("name"));
        }),
      );
    });

    const expected = editPost(
      () =>
        "<input name='post[1][title]' type='text' id='post_1_title' value='Hello World' />" +
        "<input name='post[1][comment][1][name]' type='text' id='post_1_comment_1_name' value='new comment' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form for with index and nested fields for", () => {
    rendered = formFor(post, { index: 1 }, (f) => {
      concat(
        f.fieldsFor("comment", post, null, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = editPost(
      () =>
        "<input name='post[1][comment][title]' type='text' id='post_1_comment_title' value='Hello World' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with nested collections", () => {
    formFor(post, { as: "post[]" }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("comment[]", comment, null, (c) => {
          concat(c.textField("name"));
        }),
      );
      concat(f.textField("body"));
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_post[]",
      "edit_post[]",
      { method: "patch" },
      () =>
        "<input name='post[123][title]' type='text' id='post_123_title' value='Hello World' />" +
        "<input name='post[123][comment][][name]' type='text' id='post_123_comment__name' value='new comment' />" +
        "<input name='post[123][body]' type='text' id='post_123_body' value='Back to the hill and over it again!' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with index on both", () => {
    formFor(post, { index: 1 }, (f) => {
      concat(
        f.fieldsFor("comment", post, { index: 5 }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = editPost(
      () =>
        "<input name='post[1][comment][5][title]' type='text' id='post_1_comment_5_title' value='Hello World' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with auto index", () => {
    formFor(post, { as: "post[]" }, (f) => {
      concat(
        f.fieldsFor("comment", post, null, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_post[]",
      "edit_post[]",
      { method: "patch" },
      () =>
        "<input name='post[123][comment][title]' type='text' id='post_123_comment_title' value='Hello World' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with auto index on both", () => {
    formFor(post, { as: "post[]" }, (f) => {
      concat(
        f.fieldsFor("comment[]", post, null, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "edit_post[]",
      "edit_post[]",
      { method: "patch" },
      () =>
        "<input name='post[123][comment][123][title]' type='text' id='post_123_comment_123_title' value='Hello World' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with index and auto index", () => {
    formFor(post, { as: "post[]" }, (f) => {
      concat(
        f.fieldsFor("comment", post, { index: 5 }, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    let expected = wholeForm(
      "/posts/123",
      "edit_post[]",
      "edit_post[]",
      { method: "patch" },
      () =>
        "<input name='post[123][comment][5][title]' type='text' id='post_123_comment_5_title' value='Hello World' />",
    );
    assertDomEqual(expected, rendered);

    formFor(post, { as: "post", index: 1 }, (f) => {
      concat(
        f.fieldsFor("comment[]", post, null, (c) => {
          concat(c.textField("title"));
        }),
      );
    });

    expected = wholeForm(
      "/posts/123",
      "edit_post",
      "edit_post",
      { method: "patch" },
      () =>
        "<input name='post[1][comment][123][title]' type='text' id='post_1_comment_123_title' value='Hello World' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with a new record on a nested attributes one to one association", () => {
    post.author = new Author();

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    const expected = editPost(
      () =>
        '<input name="post[title]" type="text" id="post_title" value="Hello World" />' +
        '<input id="post_author_attributes_name" name="post[author_attributes][name]" type="text" value="new author" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with explicitly passed object on a nested attributes one to one association", () => {
    formFor(post, {}, (f) => {
      f.fieldsFor("author", new Author(123), null, (af) => {
        expect(af.object).not.toBeNull();
        expect((af.object as Author).id).toBe(123);
      });
    });
  });

  it("nested fields for with an existing record on a nested attributes one to one association", () => {
    post.author = new Author(321);

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(() => titleInput + authorName + authorId),
      rendered,
    );
  });

  it("nested fields for with an existing record on a nested attributes one to one association using erb and inline block", () => {
    post.author = new Author(321);

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          return af.textField("name");
        }),
      );
    });

    assertDomEqual(
      editPost(() => titleInput + authorName + authorId),
      rendered,
    );
  });

  it("nested fields for with an existing record on a nested attributes one to one association with disabled hidden id", () => {
    post.author = new Author(321);

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, { includeId: false }, (af) => {
          return af.textField("name");
        }),
      );
    });

    assertDomEqual(
      editPost(() => titleInput + authorName),
      rendered,
    );
  });

  it("nested fields for with an existing record on a nested attributes one to one association with disabled hidden id inherited", () => {
    post.author = new Author(321);

    formFor(post, { includeId: false }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          return af.textField("name");
        }),
      );
    });

    assertDomEqual(
      editPost(() => titleInput + authorName),
      rendered,
    );
  });

  it("nested fields for with an existing record on a nested attributes one to one association with disabled hidden id override", () => {
    post.author = new Author(321);

    formFor(post, { includeId: false }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, { includeId: true }, (af) => {
          return af.textField("name");
        }),
      );
    });

    assertDomEqual(
      editPost(() => titleInput + authorName + authorId),
      rendered,
    );
  });

  it("nested fields for with existing records on a nested attributes one to one association with explicit hidden field placement", () => {
    post.author = new Author(321);

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          concat(af.hiddenField("id"));
          concat(af.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(() => titleInput + authorId + authorName),
      rendered,
    );
  });

  it("nested fields for with existing records on a nested attributes collection association with disabled hidden id", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post.author = new Author(321);
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          concat(af.textField("name"));
        }),
      );
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, { includeId: false }, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          authorName +
          authorId +
          commentName(0, "comment #1") +
          commentName(1, "comment #2"),
      ),
      rendered,
    );
  });

  it("nested fields for with existing records on a nested attributes collection association with disabled hidden id inherited", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post.author = new Author(321);
    formFor(post, { includeId: false }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, null, (af) => {
          concat(af.textField("name"));
        }),
      );
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    assertDomEqual(
      editPost(
        () => titleInput + authorName + commentName(0, "comment #1") + commentName(1, "comment #2"),
      ),
      rendered,
    );
  });

  it("nested fields for with existing records on a nested attributes collection association with disabled hidden id override", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post.author = new Author(321);
    formFor(post, { includeId: false }, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("author", null, { includeId: true }, (af) => {
          concat(af.textField("name"));
        }),
      );
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          authorName +
          authorId +
          commentName(0, "comment #1") +
          commentName(1, "comment #2"),
      ),
      rendered,
    );
  });

  it("nested fields for with existing records on a nested attributes collection association using erb and inline block", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            return cf.textField("name");
          }),
        );
      }
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentName(0, "comment #1") +
          commentId(0, 1) +
          commentName(1, "comment #2") +
          commentId(1, 2),
      ),
      rendered,
    );
  });

  it("nested fields for with existing records on a nested attributes collection association with explicit hidden field placement", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            concat(cf.hiddenField("id"));
            concat(cf.textField("name"));
          }),
        );
      }
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentId(0, 1) +
          commentName(0, "comment #1") +
          commentId(1, 2) +
          commentName(1, "comment #2"),
      ),
      rendered,
    );
  });

  it("nested fields for with new records on a nested attributes collection association", () => {
    post.comments = [new Comment(), new Comment()];
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    assertDomEqual(
      editPost(() => titleInput + commentName(0, "new comment") + commentName(1, "new comment")),
      rendered,
    );
  });

  it("nested fields for with existing and new records on a nested attributes collection association", () => {
    post.comments = [new Comment(321), new Comment()];
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentName(0, "comment #321") +
          commentId(0, 321) +
          commentName(1, "new comment"),
      ),
      rendered,
    );
  });

  it("nested fields for with an empty supplied attributes collection", () => {
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      f.fieldsFor("comments", [], null, (cf) => {
        concat(cf.textField("name"));
      });
    });

    assertDomEqual(
      editPost(() => titleInput),
      rendered,
    );
  });

  it("nested fields for with existing records on a supplied nested attributes collection", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("comments", post.comments, null, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentName(0, "comment #1") +
          commentId(0, 1) +
          commentName(1, "comment #2") +
          commentId(1, 2),
      ),
      rendered,
    );
  });

  it("nested fields for with existing records on a supplied nested attributes collection different from record one", () => {
    const comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    post.comments = [];

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("comments", comments, null, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentName(0, "comment #1") +
          commentId(0, 1) +
          commentName(1, "comment #2") +
          commentId(1, 2),
      ),
      rendered,
    );
  });

  it("nested fields for on a nested attributes collection association yields only builder", () => {
    post.comments = [new Comment(321), new Comment()];
    const yieldedComments: unknown[] = [];

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("comments", null, null, (cf) => {
          concat(cf.textField("name"));
          yieldedComments.push(cf.object);
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentName(0, "comment #321") +
          commentId(0, 321) +
          commentName(1, "new comment"),
      ),
      rendered,
    );
    expect(yieldedComments).toEqual(post.comments);
  });

  it("nested fields for with child index option override on a nested attributes collection association", () => {
    post.comments = [];

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("comments", new Comment(321), { childIndex: "abc" }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          '<input id="post_comments_attributes_abc_name" name="post[comments_attributes][abc][name]" type="text" value="comment #321" />' +
          '<input id="post_comments_attributes_abc_id" name="post[comments_attributes][abc][id]" type="hidden" value="321" autocomplete="off" />',
      ),
      rendered,
    );
  });

  it("nested fields for with child index as lambda option override on a nested attributes collection association", () => {
    post.comments = [];

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("comments", new Comment(321), { childIndex: () => "abc" }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          '<input id="post_comments_attributes_abc_name" name="post[comments_attributes][abc][name]" type="text" value="comment #321" />' +
          '<input id="post_comments_attributes_abc_id" name="post[comments_attributes][abc][id]" type="hidden" value="321" autocomplete="off" />',
      ),
      rendered,
    );
  });

  it("nested fields for index method with existing records on a nested attributes collection association", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formFor(post, {}, (f) => {
      let expected = 0;
      for (const comment of post.comments as Comment[]) {
        f.fieldsFor("comments", comment, null, (cf) => {
          expect(cf.index).toBe(expected);
          expected += 1;
        });
      }
    });
  });

  it("nested fields for index method with existing and new records on a nested attributes collection association", () => {
    post.comments = [new Comment(321), new Comment()];

    formFor(post, {}, (f) => {
      let expected = 0;
      for (const comment of post.comments as Comment[]) {
        f.fieldsFor("comments", comment, null, (cf) => {
          expect(cf.index).toBe(expected);
          expected += 1;
        });
      }
    });
  });

  it("nested fields for index method with existing records on a supplied nested attributes collection", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));

    formFor(post, {}, (f) => {
      let expected = 0;
      f.fieldsFor("comments", post.comments, null, (cf) => {
        expect(cf.index).toBe(expected);
        expected += 1;
      });
    });
  });

  it("nested fields for index method with child index option override on a nested attributes collection association", () => {
    post.comments = [];

    formFor(post, {}, (f) => {
      f.fieldsFor("comments", new Comment(321), { childIndex: "abc" }, (cf) => {
        expect(cf.index).toBe("abc");
      });
    });
  });

  it("nested fields for arel like", () => {
    post.comments = new ArelLike();

    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      concat(
        f.fieldsFor("comments", post.comments, null, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          titleInput +
          commentName(0, "comment #1") +
          commentId(0, 1) +
          commentName(1, "comment #2") +
          commentId(1, 2),
      ),
      rendered,
    );
  });

  it("nested fields for with child index option override on a nested attributes collection association with proxy", () => {
    post.comments = new FakeAssociationProxy();

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("comments", new Comment(321), { childIndex: "abc" }, (cf) => {
          concat(cf.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          '<input id="post_comments_attributes_abc_name" name="post[comments_attributes][abc][name]" type="text" value="comment #321" />' +
          '<input id="post_comments_attributes_abc_id" name="post[comments_attributes][abc][id]" type="hidden" value="321" autocomplete="off" />',
      ),
      rendered,
    );
  });

  it("nested fields uses unique indices for different collection associations", () => {
    post.comments = [new Comment(321)];
    post.tags = [new Tag(123), new Tag(456)];
    const comments = post.comments as Comment[];
    const tags = post.tags as Tag[];
    comments[0].relevances = [];
    tags[0].relevances = [];
    tags[1].relevances = [];

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("comments", comments[0], null, (cf) => {
          concat(cf.textField("name"));
          concat(
            cf.fieldsFor("relevances", new CommentRelevance(314), null, (crf) => {
              concat(crf.textField("value"));
            }),
          );
        }),
      );
      concat(
        f.fieldsFor("tags", tags[0], null, (tf) => {
          concat(tf.textField("value"));
          concat(
            tf.fieldsFor("relevances", new TagRelevance(3141), null, (trf) => {
              concat(trf.textField("value"));
            }),
          );
        }),
      );
      concat(
        f.fieldsFor("tags", tags[1], null, (tf) => {
          concat(tf.textField("value"));
          concat(
            tf.fieldsFor("relevances", new TagRelevance(31415), null, (trf) => {
              concat(trf.textField("value"));
            }),
          );
        }),
      );
    });

    const expected = editPost(
      () =>
        '<input id="post_comments_attributes_0_name" name="post[comments_attributes][0][name]" type="text" value="comment #321" />' +
        '<input id="post_comments_attributes_0_relevances_attributes_0_value" name="post[comments_attributes][0][relevances_attributes][0][value]" type="text" value="commentrelevance #314" />' +
        '<input id="post_comments_attributes_0_relevances_attributes_0_id" name="post[comments_attributes][0][relevances_attributes][0][id]" type="hidden" value="314" autocomplete="off" />' +
        '<input id="post_comments_attributes_0_id" name="post[comments_attributes][0][id]" type="hidden" value="321" autocomplete="off" />' +
        '<input id="post_tags_attributes_0_value" name="post[tags_attributes][0][value]" type="text" value="tag #123" />' +
        '<input id="post_tags_attributes_0_relevances_attributes_0_value" name="post[tags_attributes][0][relevances_attributes][0][value]" type="text" value="tagrelevance #3141" />' +
        '<input id="post_tags_attributes_0_relevances_attributes_0_id" name="post[tags_attributes][0][relevances_attributes][0][id]" type="hidden" value="3141" autocomplete="off" />' +
        '<input id="post_tags_attributes_0_id" name="post[tags_attributes][0][id]" type="hidden" value="123" autocomplete="off" />' +
        '<input id="post_tags_attributes_1_value" name="post[tags_attributes][1][value]" type="text" value="tag #456" />' +
        '<input id="post_tags_attributes_1_relevances_attributes_0_value" name="post[tags_attributes][1][relevances_attributes][0][value]" type="text" value="tagrelevance #31415" />' +
        '<input id="post_tags_attributes_1_relevances_attributes_0_id" name="post[tags_attributes][1][relevances_attributes][0][id]" type="hidden" value="31415" autocomplete="off" />' +
        '<input id="post_tags_attributes_1_id" name="post[tags_attributes][1][id]" type="hidden" value="456" autocomplete="off" />',
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with hash like model", () => {
    const author = new HashBackedAuthor();

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("author", author, null, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          '<input id="post_author_attributes_name" name="post[author_attributes][name]" type="text" value="hash backed author" />',
      ),
      rendered,
    );
  });

  it("nested fields for with hash with indifferent access like model and options", () => {
    const author = new HashWithIndifferentAccessBackedAuthor();

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("author", author, {}, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(
        () =>
          '<input id="post_author_attributes_name" name="post[author_attributes][name]" type="text" value="hash backed author" />',
      ),
      rendered,
    );
  });

  it("nested fields for with hash with indifferent access like model without options", () => {
    const author = new HashWithIndifferentAccessBackedAuthor();

    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("author", author, null, (af) => {
          concat(af.textField("name"));
        }),
      );
    });

    assertDomEqual(
      editPost(() => ""),
      rendered,
    );
  });

  it("fields for", () => {
    rendered = view.fieldsFor("post", post, {}, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[title]' type='text' id='post_title' value='Hello World' />" +
      "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[secret]' checked='checked' type='checkbox' id='post_secret' value='1' />";

    assertDomEqual(expected, rendered);
  });

  it("fields for field id", () => {
    view.fieldsFor("post", post, {}, (fields) => {
      expect(fields.fieldId("title")).toBe("post_title");
    });
  });

  it("fields for with index", () => {
    rendered = view.fieldsFor("post[]", post, {}, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[123][title]' type='text' id='post_123_title' value='Hello World' />" +
      "<textarea name='post[123][body]' id='post_123_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[123][secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[123][secret]' checked='checked' type='checkbox' id='post_123_secret' value='1' />";

    assertDomEqual(expected, rendered);
  });

  it("fields for field id with index option", () => {
    view.fieldsFor("post", post, {}, (fields) => {
      expect(fields.fieldId("title", { index: 5 })).toBe("post_5_title");
    });
  });

  it("fields for with nil index option override", () => {
    rendered = view.fieldsFor("post[]", post, { index: null }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[][title]' type='text' id='post__title' value='Hello World' />" +
      "<textarea name='post[][body]' id='post__body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[][secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[][secret]' checked='checked' type='checkbox' id='post__secret' value='1' />";

    assertDomEqual(expected, rendered);
  });

  it("fields for with index option override field id", () => {
    view.fieldsFor("post", post, { index: 1 }, (fields) => {
      expect(fields.fieldId("title")).toBe("post_1_title");
    });
  });

  it("fields for with index option override", () => {
    rendered = view.fieldsFor("post[]", post, { index: "abc" }, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[abc][title]' type='text' id='post_abc_title' value='Hello World' />" +
      "<textarea name='post[abc][body]' id='post_abc_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[abc][secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[abc][secret]' checked='checked' type='checkbox' id='post_abc_secret' value='1' />";

    assertDomEqual(expected, rendered);
  });

  it("fields for without object", () => {
    rendered = view.fieldsFor("post", null, {}, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[title]' type='text' id='post_title' value='Hello World' />" +
      "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[secret]' checked='checked' type='checkbox' id='post_secret' value='1' />";

    assertDomEqual(expected, rendered);
  });

  it("fields for with only object", () => {
    rendered = view.fieldsFor(post, null, {}, (f) => {
      concat(f.textField("title"));
      concat(f.textarea("body"));
      concat(f.checkbox("secret"));
    });

    const expected =
      "<input name='post[title]' type='text' id='post_title' value='Hello World' />" +
      "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
      "<input name='post[secret]' type='hidden' value='0' autocomplete='off' />" +
      "<input name='post[secret]' checked='checked' type='checkbox' id='post_secret' value='1' />";

    assertDomEqual(expected, rendered);
  });

  it("fields for object with bracketed name", () => {
    rendered = view.fieldsFor("author[post]", post, {}, (f) => {
      concat(f.label("title"));
      concat(f.textField("title"));
    });

    assertDomEqual(
      '<label for="author_post_title">Title</label>' +
        "<input name='author[post][title]' type='text' id='author_post_title' value='Hello World' />",
      rendered,
    );
  });

  it("fields for object with bracketed name and index", () => {
    rendered = view.fieldsFor("author[post]", post, { index: 1 }, (f) => {
      concat(f.label("title"));
      concat(f.textField("title"));
    });

    assertDomEqual(
      '<label for="author_post_1_title">Title</label>' +
        "<input name='author[post][1][title]' type='text' id='author_post_1_title' value='Hello World' />",
      rendered,
    );
  });

  it("form builder does not have form for method", () => {
    expect("formFor" in FormBuilder.prototype).toBe(false);
  });

  it("form for and fields for", () => {
    formFor(post, { as: "post", html: { id: "create-post" } }, (postForm) => {
      concat(postForm.textField("title"));
      concat(postForm.textarea("body"));

      concat(
        view.fieldsFor("parent_post", post, {}, (parentFields) => {
          concat(parentFields.checkbox("secret"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      "edit_post",
      { method: "patch" },
      () =>
        "<input name='post[title]' type='text' id='post_title' value='Hello World' />" +
        "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
        "<input name='parent_post[secret]' type='hidden' value='0' autocomplete='off' />" +
        "<input name='parent_post[secret]' checked='checked' type='checkbox' id='parent_post_secret' value='1' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form for and fields for with object", () => {
    formFor(post, { as: "post", html: { id: "create-post" } }, (postForm) => {
      concat(postForm.textField("title"));
      concat(postForm.textarea("body"));

      concat(
        postForm.fieldsFor(comment, null, null, (commentFields) => {
          concat(commentFields.textField("name"));
        }),
      );
    });

    const expected = wholeForm(
      "/posts/123",
      "create-post",
      "edit_post",
      { method: "patch" },
      () =>
        "<input name='post[title]' type='text' id='post_title' value='Hello World' />" +
        "<textarea name='post[body]' id='post_body'>\nBack to the hill and over it again!</textarea>" +
        "<input name='post[comment][name]' type='text' id='post_comment_name' value='new comment' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("form for and fields for with non nested association and without object", () => {
    formFor(post, {}, (f) => {
      concat(
        f.fieldsFor("category", null, null, (c) => {
          concat(c.textField("name"));
        }),
      );
    });

    const expected = editPost(
      () => "<input name='post[category][name]' type='text' id='post_category_name' />",
    );

    assertDomEqual(expected, rendered);
  });

  it("nested fields for with existing records on a nested attributes collection association", () => {
    post.comments = Array.from({ length: 2 }, (_, id) => new Comment(id + 1));
    formFor(post, {}, (f) => {
      concat(f.textField("title"));
      for (const comment of post.comments as Comment[]) {
        concat(
          f.fieldsFor("comments", comment, null, (cf) => {
            concat(cf.textField("name"));
          }),
        );
      }
    });

    const expected = editPost(
      () =>
        titleInput +
        commentName(0, "comment #1") +
        commentId(0, 1) +
        commentName(1, "comment #2") +
        commentId(1, 2),
    );

    assertDomEqual(expected, rendered);
  });
});
