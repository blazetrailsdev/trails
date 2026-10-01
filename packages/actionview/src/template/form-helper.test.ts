import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet, UrlFor } from "@blazetrails/actionpack";
import { Conversion, ModelName, Naming, Translation } from "@blazetrails/activemodel";
import { I18n, extend, isPresent } from "@blazetrails/activesupport";
import { Date as RubyDate, DateTime } from "@blazetrails/date";
import { Range, Struct, include } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";
import type { FormBuilder } from "../helpers/form-helper.js";
import type { LabelBuilder } from "../helpers/tags/label.js";
import { RoutingUrlFor } from "../routing-url-for.js";
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
  comments: unknown = null;
  tags: unknown = null;
  errors = { get: (field: string) => (field === "author_name" ? ["can't be empty"] : []) };
  get ["secret?"](): unknown {
    return this.secret;
  }
  isPersisted(): unknown {
    return this.persisted;
  }
  set comments_attributes(attributes: unknown) {}
  set tags_attributes(attributes: unknown) {}
  toKey(): unknown[] {
    return [123];
  }
  toParam(): string {
    return "123";
  }
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

  body: unknown = null;

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
}

class Car {
  constructor(public color: string) {}
}

include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);

const Routes = new RouteSet();
Routes.draw(function () {
  this.resources("posts", () => {
    this.resources("comments");
  });
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
    post = new Post();
    post.persisted = true;
    post.title = "Hello World";
    post.author_name = "";
    post.body = "Back to the hill and over it again!";
    post.secret = 1;
    post.written_on = RubyDate.civil(2004, 6, 15);
    post.comments = [new Comment()];
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
    class Person {
      constructor(public name: unknown) {}
    }
    include(Person, Struct.new("name"));

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

  it("label with block in erb", () => {
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
        erbView.render("test/label_with_block"),
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
});
