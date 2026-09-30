import { describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { FormBuilder } from "../helpers/form-helper.js";
import { LookupContext } from "../lookup-context.js";

class Post {
  static readonly modelName = { paramKey: "post" };

  readonly modelName = Post.modelName;

  constructor(readonly id: number | null) {}

  toKey(): unknown[] | null {
    return this.id == null ? null : [this.id];
  }
}

describe("FormHelper includes RecordIdentifier (form_helper.rb:120)", () => {
  const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);

  it("renders domId from a template", () => {
    const rendered = view.render({
      inline: "<div id=\"<%= domId(post) %>\"></div><%= domId(newPost, 'edit') %>",
      locals: { post: new Post(1), newPost: new Post(null) },
    });
    expect(String(rendered)).toBe('<div id="post_1"></div>edit_post');
  });

  it("renders domClass from a template", () => {
    const rendered = view.render({
      inline: "<%= domClass(post) %> <%= domClass(post, 'edit') %>",
      locals: { post: new Post(1) },
    });
    expect(String(rendered)).toBe("post edit_post");
  });
});

describe("FormHelper includes ModelNaming (form_helper.rb:119)", () => {
  const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);

  it("renders convertToModel from a template", () => {
    const model = new Post(1);
    const rendered = view.render({
      inline: "<%= convertToModel(post) === model %>",
      locals: { post: { toModel: () => model }, model },
    });
    expect(String(rendered)).toBe("true");
  });

  it("renders modelNameFromRecordOrClass from a template", () => {
    const rendered = view.render({
      inline: "<%= modelNameFromRecordOrClass(post).paramKey %>",
      locals: { post: new Post(1) },
    });
    expect(String(rendered)).toBe("post");
  });
});

describe("FormHelper attr_internal :default_form_builder (form_helper.rb:122)", () => {
  class SpecializedFormBuilder extends FormBuilder {}

  it("hands a controller's default_form_builder to form_with", () => {
    const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
    view.assignController({ defaultFormBuilder: () => SpecializedFormBuilder });

    let builder: unknown;
    view.formWith({ url: "/posts" }, (f: unknown) => {
      builder = f;
      return "";
    });
    expect(builder).toBeInstanceOf(SpecializedFormBuilder);
  });
});
