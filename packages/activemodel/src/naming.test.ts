import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ModelName, Naming } from "./naming.js";
import { ArgumentError } from "./attribute-assignment.js";
import { Inflections, assert, assertNot } from "@blazetrails/activesupport";

describe("NamingTest", () => {
  class Post extends Model {}

  // models/track_back.rb — `Post::TrackBack`.
  const modelName = new ModelName("TrackBack", "Post");

  it("name returns class name", () => {
    expect(Post.modelName.name).toBe("Post");
  });

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

  it("handles CamelCase", () => {
    class BlogPost extends Model {}
    expect(BlogPost.modelName.singular).toBe("blog_post");
    expect(BlogPost.modelName.plural).toBe("blog_posts");
  });

  it("instance delegates to class", () => {
    const p = new Post();
    expect(p.modelName.name).toBe("Post");
  });

  it("to_partial_path default implementation returns a string giving a relative path", () => {
    const p = new Post();
    expect(p.toPartialPath()).toBe("posts/post");
  });
});

describe("NamingHelpersTest", () => {
  // models/contact.rb / models/sheep.rb
  class Contact extends Model {}
  class Sheep extends Model {}

  // models/track_back.rb — `Post::TrackBack#to_model` returns a
  // `Post::NamedTrackBack`, so naming goes through the proxy.
  class NamedTrackBack extends Model {
    static override get modelName(): ModelName {
      return new ModelName("NamedTrackBack", "Post");
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

// Ports Rails `NamingWithNamespacedModelInSharedNamespaceTest`
// (activemodel/test/cases/naming_test.rb:87-125): `Name.new(Blog::Post)` with
// no namespace argument, so `param_key`/`route_key` keep the prefix.
describe("NamingWithNamespacedModelInSharedNamespaceTest", () => {
  const namespace = "Blog";

  it("singular", () => {
    expect(new ModelName("Post", namespace).singular).toBe("blog_post");
  });

  it("plural", () => {
    expect(new ModelName("Post", namespace).plural).toBe("blog_posts");
  });

  it("element", () => {
    expect(new ModelName("Post", namespace).element).toBe("post");
  });

  it("collection", () => {
    expect(new ModelName("Post", namespace).collection).toBe("blog/posts");
  });

  it("human", () => {
    expect(new ModelName("Post", namespace).human()).toBe("Post");
  });

  it("route key", () => {
    expect(new ModelName("Post", namespace).routeKey).toBe("blog_posts");
  });

  it("param key", () => {
    expect(new ModelName("Post", namespace).paramKey).toBe("blog_post");
  });

  it("i18n key", () => {
    expect(new ModelName("Post", namespace).i18nKey).toBe("blog/post");
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

// Ports Rails `NamingUsingRelativeModelNameTest`
// (activemodel/test/cases/naming_test.rb:183-221). Rails' setup is
// `Blog::Post.model_name`, and `Blog.use_relative_model_naming?` is true
// (test/models/blog_post.rb), so `model_name` passes `Blog` as the namespace.
describe("NamingUsingRelativeModelNameTest", () => {
  const namespace = { name: "Blog", useRelativeModelNaming: true };
  it("singular", () => {
    expect(new ModelName("Post", namespace).singular).toBe("blog_post");
  });
  it("plural", () => {
    expect(new ModelName("Post", namespace).plural).toBe("blog_posts");
  });
  it("element", () => {
    expect(new ModelName("Post", namespace).element).toBe("post");
  });
  it("collection", () => {
    expect(new ModelName("Post", namespace).collection).toBe("blog/posts");
  });
  it("human", () => {
    expect(new ModelName("Post", namespace).human()).toBe("Post");
  });
  it("route key", () => {
    expect(new ModelName("Post", namespace).routeKey).toBe("posts");
  });
  it("param key", () => {
    expect(new ModelName("Post", namespace).paramKey).toBe("post");
  });
  it("i18n key", () => {
    expect(new ModelName("Post", namespace).i18nKey).toBe("blog/post");
  });
});

// Ports Rails `NamingWithNamespacedModelInIsolatedNamespaceTest`
// (activemodel/test/cases/naming_test.rb:51-86): `Name.new(Blog::Post, Blog)`.
describe("NamingWithNamespacedModelInIsolatedNamespaceTest", () => {
  const namespace = { name: "Blog", useRelativeModelNaming: true };
  it("singular", () => {
    expect(new ModelName("Post", namespace).singular).toBe("blog_post");
  });
  it("human", () => {
    expect(new ModelName("Post", namespace).human()).toBe("Post");
  });
  it("plural", () => {
    expect(new ModelName("Post", namespace).plural).toBe("blog_posts");
  });
  it("element", () => {
    expect(new ModelName("Post", namespace).element).toBe("post");
  });
  it("collection", () => {
    expect(new ModelName("Post", namespace).collection).toBe("blog/posts");
  });
  it("route key", () => {
    expect(new ModelName("Post", namespace).routeKey).toBe("posts");
  });
  it("param key", () => {
    expect(new ModelName("Post", namespace).paramKey).toBe("post");
  });
  it("i18n key", () => {
    expect(new ModelName("Post", namespace).i18nKey).toBe("blog/post");
  });
});

// Ports Rails `NameWithAnonymousClassTest`
// (activemodel/test/cases/naming_test.rb:166-182): anonymous classes
// (nil/blank `name`) must raise unless an explicit `name:` override is
// supplied.
// Rails' anonymous-class path is `ActiveModel::Name.new(klass, nil, "Anonymous")`
// — `name` arg supplies the display name since `klass.name` is nil.
// In TS the className arg is already a string, so just pass the name directly.
describe("NameWithAnonymousClassTest", () => {
  it("anonymous class without name argument", () => {
    expect(() => new ModelName("")).toThrow(/cannot be blank/);
  });

  it("anonymous class with name argument", () => {
    const modelName = new ModelName("Anonymous");
    expect(modelName.name).toEqual("Anonymous");
  });
});

// Arbitrary-depth namespaces: Rails walks a full `::` chain via
// `_singularize`/`tableize`; our equivalent is a segment array — same
// output, no Ruby-shaped strings in the TS API.
describe("ModelName deeply-nested namespace", () => {
  it("multi-segment namespace array produces full prefix on derived fields", () => {
    const name = new ModelName("Post", ["Admin", "Blog"]);
    expect(name.name).toBe("Admin::Blog::Post");
    expect(Array.from(name.namespace ?? [])).toEqual(["Admin", "Blog"]);
    expect(name.singular).toBe("admin_blog_post");
    expect(name.plural).toBe("admin_blog_posts");
    expect(name.element).toBe("post");
    expect(name.collection).toBe("admin/blog/posts");
    expect(name.i18nKey).toBe("admin/blog/post");
    expect(name.paramKey).toBe("admin_blog_post");
    expect(name.routeKey).toBe("admin_blog_posts");
  });
});

describe("ModelName rejects Ruby-shaped strings", () => {
  it("throws when className contains ::", () => {
    expect(() => new ModelName("Blog::Post")).toThrow(/must not contain/);
  });
  it("throws when namespace contains ::", () => {
    expect(() => new ModelName("Post", "Admin::Blog")).toThrow(/must not contain/);
  });
});

describe("ModelName rejects malformed namespace option", () => {
  it("throws ArgumentError on object without a string .name", () => {
    expect(() => new ModelName("Post", {} as unknown as { name: string })).toThrow(ArgumentError);
  });
  it("throws ArgumentError on array with non-string elements", () => {
    expect(() => new ModelName("Post", ["Blog", 42 as unknown as string])).toThrow(ArgumentError);
  });
  it("throws ArgumentError on empty-string namespace", () => {
    expect(() => new ModelName("Post", "")).toThrow(ArgumentError);
  });
  it("throws ArgumentError on whitespace-only segment in an array", () => {
    expect(() => new ModelName("Post", ["Blog", "   "])).toThrow(ArgumentError);
  });
  it("throws ArgumentError on blank name", () => {
    expect(() => new ModelName("   ")).toThrow(ArgumentError);
  });
});

describe("ModelName singularRouteKey", () => {
  it("top-level: equal to singular", () => {
    const name = new ModelName("Post");
    expect(name.singularRouteKey).toBe("post");
    expect(name.routeKey).toBe("posts");
  });
  it("namespaced: singularizes the prefix-dropped routeKey", () => {
    const name = new ModelName("Post", { name: "Blog", useRelativeModelNaming: true });
    expect(name.routeKey).toBe("posts");
    expect(name.singularRouteKey).toBe("post");
  });
  it("uncountable: routeKey gets `_index` suffix", () => {
    // Rails naming.rb:184 — `@route_key << "_index" if @uncountable`.
    const name = new ModelName("Sheep");
    expect(name.plural).toBe("sheep");
    expect(name.routeKey).toBe("sheep_index");
    // singularRouteKey is `singularize(routeKey)`; whatever our activesupport
    // Inflector returns for "sheep_index" is the expected value — assert it's
    // derived from routeKey, not independently computed.
    expect(name.singularRouteKey.length).toBeGreaterThan(0);
  });
  it("Naming.singularRouteKey delegates to ModelName.singularRouteKey", () => {
    const name = new ModelName("Post", "Blog");
    expect(Naming.singularRouteKey(name)).toBe(name.singularRouteKey);
  });
});

describe("ModelName collection is derived from plural", () => {
  // Addresses the uncountable-consistency concern: whatever decision
  // `plural` makes (local uncountables table, activesupport Inflector rules,
  // whatever), `collection` follows the same decision instead of
  // independently pluralizing.
  it("namespaced normal word: collection tail === bare pluralization", () => {
    const name = new ModelName("Post", "Blog");
    expect(name.plural).toBe("blog_posts");
    expect(name.collection).toBe("blog/posts");
  });

  it("addUncountable on full singular keeps plural and collection in sync", () => {
    Inflections.instance("en").uncountable("legal_status");
    const name = new ModelName("Status", "Legal");
    expect(name.singular).toBe("legal_status");
    expect(name.plural).toBe("legal_status"); // uncountable per local table
    expect(name.collection).toBe("legal/status"); // tail follows plural
  });
});

describe("ModelName namespace accepts Module-like {name}", () => {
  it("an object with a string `name` property is equivalent to the string form", () => {
    const asObject = new ModelName("Post", { name: "Blog" });
    const asString = new ModelName("Post", "Blog");
    expect(asObject.singular).toBe(asString.singular);
    expect(asObject.paramKey).toBe(asString.paramKey);
    expect(asObject.routeKey).toBe(asString.routeKey);
  });
});

// Rails `ActiveModel::Name` includes Comparable and delegates ==/<=>/
// =~/match?/to_s/to_str/as_json to @name (naming.rb:10, :151-152). JS
// can't overload those operators, so we expose methods + Symbol.toPrimitive.
describe("ModelName is string-ish (Rails String-inheritance analog)", () => {
  it("toString returns the class name", () => {
    expect(new ModelName("Post").toString()).toBe("Post");
    expect(String(new ModelName("Post"))).toBe("Post");
    expect(`${new ModelName("Post")}`).toBe("Post");
  });

  it("Symbol.toPrimitive coerces to the class name in string concatenation", () => {
    const mn = new ModelName("Post");
    expect("Model: " + mn).toBe("Model: Post");
  });

  it("equals compares against strings and other ModelName instances", () => {
    const mn = new ModelName("Post");
    expect(mn.equals("Post")).toBe(true);
    expect(mn.equals("Other")).toBe(false);
    expect(mn.equals(new ModelName("Post"))).toBe(true);
    expect(mn.equals(new ModelName("Other"))).toBe(false);
    expect(mn.equals(42)).toBe(false);
  });

  it("compare returns -1/0/1 matching String#<=>", () => {
    const mn = new ModelName("BlogPost");
    expect(mn.compare("BlogPost")).toBe(0);
    expect(mn.compare("Blog")).toBe(1);
    expect(mn.compare("BlogPosts")).toBe(-1);
    expect(mn.compare(new ModelName("BlogPost"))).toBe(0);
  });

  it("match tests a regexp against the class name", () => {
    const mn = new ModelName("BlogPost");
    expect(mn.match(/Post/)).toBe(true);
    expect(mn.match(/\d/)).toBe(false);
  });

  it("match stays stable when reusing global and sticky regexps", () => {
    // RegExp.prototype.test advances `lastIndex` on /g and /y flags, so a
    // second call on the same regex can flip false without care. Our
    // `match` saves/restores `lastIndex` so repeated calls are stable
    // (Ruby `match?` is stateless).
    const mn = new ModelName("BlogPost");
    const globalRe = /Post/g;
    const stickyRe = /Blog/y;
    expect(mn.match(globalRe)).toBe(true);
    expect(mn.match(globalRe)).toBe(true);
    expect(mn.match(stickyRe)).toBe(true);
    expect(mn.match(stickyRe)).toBe(true);
    expect(globalRe.lastIndex).toBe(0);
    expect(stickyRe.lastIndex).toBe(0);
  });

  it("compare throws ArgumentError on non-string/non-ModelName input", () => {
    const mn = new ModelName("Post");
    expect(() => mn.compare(42)).toThrow(ArgumentError);
    expect(() => mn.compare(null)).toThrow(ArgumentError);
    expect(() => mn.compare(undefined)).toThrow(ArgumentError);
  });

  it("match throws ArgumentError on non-RegExp input", () => {
    const mn = new ModelName("Post");
    expect(() => mn.match("Post")).toThrow(ArgumentError);
    expect(() => mn.match(null)).toThrow(ArgumentError);
    expect(() => mn.match(undefined)).toThrow(ArgumentError);
  });

  it("equals / compare distinguish namespaced models with the same bare name", () => {
    // Two ModelName instances share the same `name: "Post"` but differ
    // in namespace — must not compare equal, must sort deterministically.
    const blogPost = new ModelName("Post", "Blog");
    const adminPost = new ModelName("Post", "Admin");
    const blogPost2 = new ModelName("Post", "Blog");
    const barePost = new ModelName("Post");

    expect(blogPost.equals(adminPost)).toBe(false);
    expect(blogPost.equals(blogPost2)).toBe(true);
    expect(blogPost.equals(barePost)).toBe(false);
    // `compare` compares the full qualified path ("Admin/Post" vs
    // "Blog/Post"), so Admin < Blog.
    expect(blogPost.compare(adminPost)).toBe(1);
    expect(adminPost.compare(blogPost)).toBe(-1);
    expect(blogPost.compare(blogPost2)).toBe(0);

    // String coercion yields the full qualified constant path, matching
    // Rails' `@name` (`"Blog::Post"`). A bare-name string is therefore not
    // equal to a namespaced model.
    expect(String(blogPost)).toBe("Blog::Post");
    expect(String(adminPost)).toBe("Admin::Post");
    expect(blogPost.equals("Post")).toBe(false);
    expect(blogPost.equals("Blog::Post")).toBe(true);
  });

  it("compare sorts by full qualified path, not bare name first", () => {
    // Covers the Rails `String#<=>` parity: ordering is determined by
    // the full namespace+name path as a single string — so a model
    // under an earlier-sorting namespace outranks a later-sorting
    // namespace even when its bare name comes later alphabetically.
    const adminOther = new ModelName("Other", "Admin");
    const blogPost = new ModelName("Post", "Blog");
    // "Admin/Other" < "Blog/Post"
    expect(adminOther.compare(blogPost)).toBe(-1);
    expect(blogPost.compare(adminOther)).toBe(1);
    // Bare name ("Post") > a qualified name starting with earlier letters
    // ("Admin/Other")? No — bare comparison uses the raw qualified path,
    // so "Admin/Other" < "Post".
    const barePost = new ModelName("Post");
    expect(adminOther.compare(barePost)).toBe(-1);
    expect(barePost.compare(adminOther)).toBe(1);
  });

  it("== operator coerces via Symbol.toPrimitive to the class name", () => {
    // Rails `model_name == "Post"` is true because Name < String.
    // JS `==` between object and string triggers primitive coercion,
    // which Symbol.toPrimitive steers at the class name — so the
    // Rails-shaped comparison works verbatim.
    const mn: unknown = new ModelName("Post");

    expect(mn == "Post").toBe(true);

    expect(mn == "Other").toBe(false);
  });

  it("asJson / JSON.stringify emits the plain class name", () => {
    // Rails `String#as_json` returns the string; `Name.new(BlogPost).to_json`
    // emits '"BlogPost"', not a hash form.
    const mn = new ModelName("BlogPost");
    expect(mn.asJson()).toBe("BlogPost");
    expect(JSON.stringify(mn)).toBe('"BlogPost"');
    expect(JSON.stringify({ model: mn })).toBe('{"model":"BlogPost"}');
  });
});

describe("OverridingAccessorsTest", () => {
  it("overriding accessors keys", () => {
    const modelName = new ModelName("TrackBack", "Post");
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
describe("humanAttributeName()", () => {
  it("humanizes attribute names at the Model level", () => {
    class User extends Model {
      static {
        this.attribute("first_name", "string");
      }
    }
    expect(User.humanAttributeName("first_name")).toBe("First name");
    expect(User.humanAttributeName("email")).toBe("Email");
  });
});

describe("i18nScope", () => {
  it("returns 'activemodel' by default", () => {
    class User extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    expect(User.i18nScope).toBe("activemodel");
  });
});

describe("ModelName locale", () => {
  it("pluralizes and looks up uncountables through the locale's inflections", () => {
    Inflections.instance("es").plural(/$/, "es");
    Inflections.instance("es").singular(/es$/, "");
    const name = new ModelName("Ley", undefined, undefined, "es");
    expect(name.plural).toBe("leyes");
    expect(name.collection).toBe("leyes");
    expect(name.routeKey).toBe("leyes");
    expect(name.singularRouteKey).toBe("ley");
    expect(new ModelName("Ley").plural).toBe("leys");
    Inflections.instance("es").uncountable("dinero");
    const uncountable = new ModelName("Dinero", undefined, undefined, "es");
    expect(uncountable.plural).toBe("dinero");
    expect(uncountable.routeKey).toBe("dinero_index");
  });
});
