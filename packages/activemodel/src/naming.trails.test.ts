/**
 * TS-only coverage that sits beside the ported `naming_test.rb` mirror in
 * `naming.test.ts`. Rails has no counterpart for these — they cover the
 * TypeScript spellings of `ActiveModel::Name` (a plain class where Rails
 * subclasses `String`) and the trails-side accessors — so they live here to
 * keep the mirrored file free of names `parity:test` reports as extra.
 */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ModelName, Naming } from "./naming.js";
import { TypeError } from "./attribute-assignment.js";
import { Inflections } from "@blazetrails/activesupport";

describe("naming (trails-only)", () => {
  class Post extends Model {}

  it("name returns class name", () => {
    expect(Post.modelName.name).toBe("Post");
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
      expect(mn.match("Post")).toBe(true);
      expect(mn.match("os")).toBe(true);
      expect(mn.match("\\d")).toBe(false);
      expect(() => mn.match(null)).toThrow("wrong argument type nil (expected Regexp)");
      expect(() => mn.match(undefined)).toThrow("wrong argument type nil (expected Regexp)");
      expect(() => mn.match(42)).toThrow("wrong argument type Integer (expected Regexp)");
      expect(() => mn.match(1.5)).toThrow("wrong argument type Float (expected Regexp)");
      expect(() => mn.match(true)).toThrow("wrong argument type true (expected Regexp)");
      expect(() => mn.match([1])).toThrow("wrong argument type Array (expected Regexp)");
      expect(() => mn.match(null)).toThrow(TypeError);
    });

    it("caseEquals and eql delegate to the name", () => {
      const mn = new ModelName("Post");
      expect(mn.caseEquals("Post")).toBe(true);
      expect(mn.caseEquals(new ModelName("Post"))).toBe(true);
      expect(mn.caseEquals("Blog::Post")).toBe(false);
      expect(mn.eql("Post")).toBe(true);
      expect(mn.eql(new ModelName("Post"))).toBe(false);
    });

    it("equals / compare distinguish namespaced models with the same bare name", () => {
      const blogPost = new ModelName("Blog::Post");
      const adminPost = new ModelName("Admin::Post");
      const blogPost2 = new ModelName("Blog::Post");
      const barePost = new ModelName("Post");

      expect(blogPost.equals(adminPost)).toBe(false);
      expect(blogPost.equals(blogPost2)).toBe(true);
      expect(blogPost.equals(barePost)).toBe(false);
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
      expect(adminOther.compare(blogPost)).toBe(-1);
      expect(blogPost.compare(adminOther)).toBe(1);
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
});
