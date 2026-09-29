import { beforeEach, describe, expect, it } from "vitest";
import { Errors } from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/date";

import { Base } from "../base.js";
import { raw } from "../helpers/output-safety-helper.js";
import { LookupContext } from "../lookup-context.js";

function normalizeDom(html: string): string {
  return html.replace(
    /<([a-z]+)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g,
    (_m, name, attrs) => {
      const list = (attrs.match(/[^\s=]+(?:=(?:"[^"]*"|'[^']*'))?/g) ?? []).map((a: string) =>
        a.replace(/='([^']*)'$/, '="$1"'),
      );
      return `<${name} ${list.sort().join(" ")}>`;
    },
  );
}

function assertDomEqual(expected: string, actual: unknown): void {
  expect(normalizeDom(String(actual))).toBe(normalizeDom(expected));
}

class Post {
  static modelName = { singular: "post", paramKey: "post", i18nKey: "post" };
  author_name: unknown = null;
  body: unknown = null;
  category: unknown = null;
  published: unknown = null;
  updated_at: unknown = null;
  errors: Errors<Post> = new Errors(this);
  get modelName(): typeof Post.modelName {
    return Post.modelName;
  }
  isPersisted(): boolean {
    return false;
  }
}

type View = Base & Record<string, (...args: unknown[]) => unknown> & { post: Post };

describe("ActiveModelHelperTest", () => {
  let view: View;

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
    const post = new Post();
    post.errors.add("author_name", "can't be empty");
    post.errors.add("body", "foo");
    post.errors.add("category", "must exist");
    post.errors.add("published", "must be accepted");
    post.errors.add("updated_at", "bar");

    post.author_name = "";
    post.body = "Back to the hill and over it again!";
    post.category = "rails";
    post.published = false;
    post.updated_at = Temporal.PlainDate.from({ year: 2004, month: 6, day: 15 });
    view.post = post;
  });

  it("textarea with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><textarea id="post_body" name="post[body]">\nBack to the hill and over it again!</textarea></div>',
      view.textarea("post", "body"),
    );
  });

  it("text field with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><input id="post_author_name" name="post[author_name]" type="text" value="" /></div>',
      view.textField("post", "author_name"),
    );
  });

  it("hidden field does not render errors", () => {
    assertDomEqual(
      '<input id="post_author_name" name="post[author_name]" type="hidden" value="" autocomplete="off" />',
      view.hiddenField("post", "author_name"),
    );
  });

  it("field error proc", () => {
    const oldProc = Base.fieldErrorProc;
    try {
      Base.fieldErrorProc = function (htmlTag, instance) {
        return raw(
          `<div class="field_with_errors">${htmlTag} <span class="error">${[(instance as { errorMessage(): unknown }).errorMessage()].flat(Infinity).join(", ")}</span></div>`,
        );
      };

      assertDomEqual(
        '<div class="field_with_errors"><input id="post_author_name" name="post[author_name]" type="text" value="" /> <span class="error">can\'t be empty</span></div>',
        view.textField("post", "author_name"),
      );
    } finally {
      Base.fieldErrorProc = oldProc;
    }
  });
});
