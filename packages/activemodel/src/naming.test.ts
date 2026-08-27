import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ModelName, Naming } from "./naming.js";
import { assert, assertNot } from "@blazetrails/activesupport";

describe("NamingTest", () => {
  const modelName = new ModelName("Post::TrackBack");

  it("singular", () => {
    expect(modelName.singular).toEqual("post_track_back");
  });

  it("plural", () => {
    expect(modelName.plural).toEqual("post_track_backs");
  });

  it("element", () => {
    expect(modelName.element).toEqual("track_back");
  });

  it("collection", () => {
    expect(modelName.collection).toEqual("post/track_backs");
  });

  it("human", () => {
    expect(modelName.human()).toEqual("Track back");
  });

  it("route key", () => {
    expect(modelName.routeKey).toEqual("post_track_backs");
  });

  it("param key", () => {
    expect(modelName.paramKey).toEqual("post_track_back");
  });

  it("i18n key", () => {
    expect(modelName.i18nKey).toEqual("post/track_back");
  });

  it("uncountable", () => {
    expect(modelName.isUncountable).toEqual(false);
  });
});

describe("NamingHelpersTest", () => {
  class Contact extends Model {}
  class Sheep extends Model {}

  class NamedTrackBack extends Model {
    static override get modelName(): ModelName {
      return new ModelName("Post::NamedTrackBack");
    }
  }
  class TrackBack {
    toModel(): NamedTrackBack {
      return new NamedTrackBack({});
    }
  }

  const record = new Contact({});
  const singular = "contact";
  const plural = "contacts";
  const uncountable = Sheep;
  const singularRouteKey = "contact";
  const routeKey = "contacts";
  const paramKey = "contact";

  it("to model called on record", () => {
    expect(Naming.plural(new TrackBack())).toEqual("post_named_track_backs");
  });

  it("singular", () => {
    expect(Naming.singular(record)).toEqual(singular);
  });

  it("singular for class", () => {
    expect(Naming.singular(Contact)).toEqual(singular);
  });

  it("plural", () => {
    expect(Naming.plural(record)).toEqual(plural);
  });

  it("plural for class", () => {
    expect(Naming.plural(Contact)).toEqual(plural);
  });

  it("route key", () => {
    expect(Naming.routeKey(record)).toEqual(routeKey);
    expect(Naming.singularRouteKey(record)).toEqual(singularRouteKey);
  });

  it("route key for class", () => {
    expect(Naming.routeKey(Contact)).toEqual(routeKey);
    expect(Naming.singularRouteKey(Contact)).toEqual(singularRouteKey);
  });

  it("param key", () => {
    expect(Naming.paramKey(record)).toEqual(paramKey);
  });

  it("param key for class", () => {
    expect(Naming.paramKey(Contact)).toEqual(paramKey);
  });

  it("uncountable", () => {
    assert(Naming.isUncountable(uncountable), "Expected 'sheep' to be uncountable");
    assertNot(Naming.isUncountable(Contact), "Expected 'contact' to be countable");
  });

  it("uncountable route key", () => {
    expect(Naming.singularRouteKey(uncountable)).toEqual("sheep");
    expect(Naming.routeKey(uncountable)).toEqual("sheep_index");
  });
});

describe("NamingMethodDelegationTest", () => {
  it("model name", () => {
    class Article extends Model {}
    expect(Article.modelName.name).toBe("Article");
  });
});

describe("NamingWithNamespacedModelInSharedNamespaceTest", () => {
  it("singular", () => {
    expect(new ModelName("Blog::Post").singular).toBe("blog_post");
  });

  it("plural", () => {
    expect(new ModelName("Blog::Post").plural).toBe("blog_posts");
  });

  it("element", () => {
    expect(new ModelName("Blog::Post").element).toBe("post");
  });

  it("collection", () => {
    expect(new ModelName("Blog::Post").collection).toBe("blog/posts");
  });

  it("human", () => {
    expect(new ModelName("Blog::Post").human()).toBe("Post");
  });

  it("route key", () => {
    expect(new ModelName("Blog::Post").routeKey).toBe("blog_posts");
  });

  it("param key", () => {
    expect(new ModelName("Blog::Post").paramKey).toBe("blog_post");
  });

  it("i18n key", () => {
    expect(new ModelName("Blog::Post").i18nKey).toBe("blog/post");
  });
});

describe("NamingWithSuppliedModelNameTest", () => {
  it("singular", () => {
    const name = new ModelName("Article");
    expect(name.singular).toBe("article");
  });
  it("plural", () => {
    const name = new ModelName("Article");
    expect(name.plural).toBe("articles");
  });
  it("element", () => {
    const name = new ModelName("Article");
    expect(name.element).toBe("article");
  });
  it("collection", () => {
    const name = new ModelName("Article");
    expect(name.collection).toBe("articles");
  });
  it("human", () => {
    const name = new ModelName("Article");
    expect(name.human()).toBe("Article");
  });
  it("route key", () => {
    const name = new ModelName("Article");
    expect(name.routeKey).toBe("articles");
  });
  it("param key", () => {
    const name = new ModelName("Article");
    expect(name.paramKey).toBe("article");
  });
  it("i18n key", () => {
    const name = new ModelName("Article");
    expect(name.i18nKey).toBe("article");
  });
});

describe("NamingWithSuppliedLocaleTest", () => {
  it("singular", () => {
    const name = new ModelName("Person");
    expect(name.singular).toBe("person");
  });
  it("plural", () => {
    const name = new ModelName("Person");
    expect(name.plural).toBe("people");
  });
});

describe("NamingUsingRelativeModelNameTest", () => {
  const namespace = { name: "Blog" };
  it("singular", () => {
    expect(new ModelName("Blog::Post", namespace).singular).toBe("blog_post");
  });
  it("plural", () => {
    expect(new ModelName("Blog::Post", namespace).plural).toBe("blog_posts");
  });
  it("element", () => {
    expect(new ModelName("Blog::Post", namespace).element).toBe("post");
  });
  it("collection", () => {
    expect(new ModelName("Blog::Post", namespace).collection).toBe("blog/posts");
  });
  it("human", () => {
    expect(new ModelName("Blog::Post", namespace).human()).toBe("Post");
  });
  it("route key", () => {
    expect(new ModelName("Blog::Post", namespace).routeKey).toBe("posts");
  });
  it("param key", () => {
    expect(new ModelName("Blog::Post", namespace).paramKey).toBe("post");
  });
  it("i18n key", () => {
    expect(new ModelName("Blog::Post", namespace).i18nKey).toBe("blog/post");
  });
});

describe("NamingWithNamespacedModelInIsolatedNamespaceTest", () => {
  const namespace = { name: "Blog" };
  it("singular", () => {
    expect(new ModelName("Blog::Post", namespace).singular).toBe("blog_post");
  });
  it("human", () => {
    expect(new ModelName("Blog::Post", namespace).human()).toBe("Post");
  });
  it("plural", () => {
    expect(new ModelName("Blog::Post", namespace).plural).toBe("blog_posts");
  });
  it("element", () => {
    expect(new ModelName("Blog::Post", namespace).element).toBe("post");
  });
  it("collection", () => {
    expect(new ModelName("Blog::Post", namespace).collection).toBe("blog/posts");
  });
  it("route key", () => {
    expect(new ModelName("Blog::Post", namespace).routeKey).toBe("posts");
  });
  it("param key", () => {
    expect(new ModelName("Blog::Post", namespace).paramKey).toBe("post");
  });
  it("i18n key", () => {
    expect(new ModelName("Blog::Post", namespace).i18nKey).toBe("blog/post");
  });
});

describe("NameWithAnonymousClassTest", () => {
  it("anonymous class without name argument", () => {
    expect(() => new ModelName("")).toThrow(/cannot be blank/);
  });

  it("anonymous class with name argument", () => {
    const modelName = new ModelName("Anonymous");
    expect(modelName.name).toEqual("Anonymous");
  });
});

describe("OverridingAccessorsTest", () => {
  it("overriding accessors keys", () => {
    const modelName = new ModelName("Post::TrackBack");
    modelName.singular = "singular";
    modelName.plural = "plural";
    modelName.element = "element";
    modelName.collection = "collection";
    modelName.singularRouteKey = "singular_route_key";
    modelName.routeKey = "route_key";
    modelName.paramKey = "param_key";
    modelName.i18nKey = "i18n_key";
    modelName.name = "name";

    expect(modelName.singular).toEqual("singular");
    expect(modelName.plural).toEqual("plural");
    expect(modelName.element).toEqual("element");
    expect(modelName.collection).toEqual("collection");
    expect(modelName.singularRouteKey).toEqual("singular_route_key");
    expect(modelName.routeKey).toEqual("route_key");
    expect(modelName.paramKey).toEqual("param_key");
    expect(modelName.i18nKey).toEqual("i18n_key");
    expect(modelName.name).toEqual("name");
  });
});
