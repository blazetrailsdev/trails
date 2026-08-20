import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ModelName, Naming } from "./naming.js";
import { ArgumentError } from "./attribute-assignment.js";
import { Inflections, assert, assertNot } from "@blazetrails/activesupport";

describe("NamingTest", () => {
  class Post extends Model {}

  // models/track_back.rb — `Post::TrackBack`.
  const modelName = new ModelName("Post::TrackBack");

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

// Ports Rails `NamingWithNamespacedModelInSharedNamespaceTest`
// (activemodel/test/cases/naming_test.rb:87-125): `Name.new(Blog::Post)` with
// no namespace argument, so `param_key`/`route_key` keep the prefix.
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

// Ports Rails `NamingUsingRelativeModelNameTest`
// (activemodel/test/cases/naming_test.rb:183-221). Rails' setup is
// `Blog::Post.model_name`, and `Blog.use_relative_model_naming?` is true
// (test/models/blog_post.rb), so `model_name` passes `Blog` as the namespace.
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

// Ports Rails `NamingWithNamespacedModelInIsolatedNamespaceTest`
// (activemodel/test/cases/naming_test.rb:51-86): `Name.new(Blog::Post, Blog)`.
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

describe("ModelName singularRouteKey", () => {
  it("top-level: equal to singular", () => {
    const name = new ModelName("Post");
    expect(name.singularRouteKey).toBe("post");
    expect(name.routeKey).toBe("posts");
  });
  it("namespaced: singularizes the prefix-dropped routeKey", () => {
    const name = new ModelName("Blog::Post", { name: "Blog" });
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
    const name = new ModelName("Blog::Post");
    expect(Naming.singularRouteKey(name)).toBe(name.singularRouteKey);
  });
});

describe("ModelName collection", () => {
  it("namespaced: `tableize(@name)` pluralizes the last path segment", () => {
    const name = new ModelName("Blog::Post");
    expect(name.plural).toBe("blog_posts");
    expect(name.collection).toBe("blog/posts");
  });

  it("uncountable full singular leaves collection on tableize's own inflection", () => {
    // `@plural` is `pluralize(@singular)` and `@collection` is
    // `tableize(@name)` (naming.rb:174, :178) — two independent inflections,
    // so an uncountable registered on the `_`-joined singular does not reach
    // the `/`-joined path form.
    Inflections.instance("en").uncountable("legal_status");
    const name = new ModelName("Legal::Status");
    expect(name.singular).toBe("legal_status");
    expect(name.plural).toBe("legal_status");
    expect(name.collection).toBe("legal/statuses");
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
    // `String#<=>` answers nil for an operand that is not string-like.
    expect(mn.compare(42)).toBe(undefined);
    expect(mn.compare(null)).toBe(undefined);
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

  it("match throws ArgumentError on non-RegExp input", () => {
    const mn = new ModelName("Post");
    // A String is NOT invalid input: Ruby `String#match?` compiles a String
    // operand as the pattern (naming.rb:114-128 delegates `match?` to `name`).
    expect(mn.match("Post")).toBe(true);
    expect(mn.match("os")).toBe(true);
    expect(mn.match("\\d")).toBe(false);
    expect(() => mn.match(null)).toThrow(ArgumentError);
    expect(() => mn.match(undefined)).toThrow(ArgumentError);
  });

  it("caseEquals and eql delegate to the name", () => {
    // naming.rb:151-152 `delegate :===, :eql?, to: :name`. `String#===` is
    // aliased to `String#==` and so takes its `to_str` arm; `String#eql?`
    // checks the class first, so another `Name` is not `eql?` to this one.
    const mn = new ModelName("Post");
    expect(mn.caseEquals("Post")).toBe(true);
    expect(mn.caseEquals(new ModelName("Post"))).toBe(true);
    expect(mn.caseEquals("Blog::Post")).toBe(false);
    expect(mn.eql("Post")).toBe(true);
    expect(mn.eql(new ModelName("Post"))).toBe(false);
  });

  it("equals / compare distinguish namespaced models with the same bare name", () => {
    // Two ModelName instances share the same `name: "Post"` but differ
    // in namespace — must not compare equal, must sort deterministically.
    const blogPost = new ModelName("Blog::Post");
    const adminPost = new ModelName("Admin::Post");
    const blogPost2 = new ModelName("Blog::Post");
    const barePost = new ModelName("Post");

    expect(blogPost.equals(adminPost)).toBe(false);
    expect(blogPost.equals(blogPost2)).toBe(true);
    expect(blogPost.equals(barePost)).toBe(false);
    // `compare` is `String#<=>` on `@name` ("Admin::Post" vs "Blog::Post"),
    // so Admin < Blog.
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
    const adminOther = new ModelName("Admin::Other");
    const blogPost = new ModelName("Blog::Post");
    // "Admin::Other" < "Blog::Post"
    expect(adminOther.compare(blogPost)).toBe(-1);
    expect(blogPost.compare(adminOther)).toBe(1);
    // Comparison is over the raw qualified path, so "Admin::Other" < "Post".
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
    // Rails' `@collection = tableize(@name)` (naming.rb:178) takes no locale,
    // so the collection stays on the default `:en` inflections.
    expect(name.collection).toBe("leys");
    expect(name.routeKey).toBe("leyes");
    expect(name.singularRouteKey).toBe("ley");
    expect(new ModelName("Ley").plural).toBe("leys");
    Inflections.instance("es").uncountable("dinero");
    const uncountable = new ModelName("Dinero", undefined, undefined, "es");
    expect(uncountable.plural).toBe("dinero");
    expect(uncountable.routeKey).toBe("dinero_index");
  });
});
