import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18n } from "@blazetrails/activesupport";
import { Date as RubyDate, DateTime } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

class Post {
  static modelName = { singular: "post", paramKey: "post", i18nKey: "post" };
  title: unknown = null;
  body: unknown = null;
  secret: unknown = null;
  author_name: unknown = null;
  written_on: unknown = null;
  cost: unknown = null;
  errors = { get: (field: string) => (field === "author_name" ? ["can't be empty"] : []) };
  get modelName(): typeof Post.modelName {
    return Post.modelName;
  }
  get ["secret?"](): unknown {
    return this.secret;
  }
  toParam(): string {
    return "123";
  }
}

class Car {
  constructor(public color: string) {}
}

type View = Base & Record<string, (...args: unknown[]) => unknown> & { post: Post; car: Car };

describe("FormHelperTest", () => {
  let view: View;
  let post: Post;

  beforeEach(() => {
    I18n.backend().storeTranslations("placeholder", {
      helpers: { placeholder: { post: { title: "What is this about?" } } },
    });
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
    post = new Post();
    post.title = "Hello World";
    post.author_name = "";
    post.body = "Back to the hill and over it again!";
    post.secret = 1;
    post.written_on = RubyDate.civil(2004, 6, 15);
    view.post = post;
    view.car = new Car("#000FFF");
  });

  afterEach(() => {
    I18n.reloadBang();
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
