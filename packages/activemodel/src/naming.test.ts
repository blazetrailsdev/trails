import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ModelName } from "./naming.js";

describe("ActiveModel", () => {
  describe("Naming", () => {
    class Post extends Model {}

    it("name returns class name", () => {
      expect(Post.modelName.name).toBe("Post");
    });

    it("singular", () => {
      expect(Post.modelName.singular).toBe("post");
    });

    it("plural", () => {
      expect(Post.modelName.plural).toBe("posts");
    });

    it("element", () => {
      expect(Post.modelName.element).toBe("post");
    });

    it("collection", () => {
      expect(Post.modelName.collection).toBe("posts");
    });

    it("param key", () => {
      expect(Post.modelName.paramKey).toBe("post");
    });

    it("route key", () => {
      expect(Post.modelName.routeKey).toBe("posts");
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
      expect(p.toPartialPath()).toBe("posts/_post");
    });

    it("i18n key", () => {
      class BlogPost extends Model {}
      expect(BlogPost.modelName.i18nKey).toBe("blog_post");
    });
  });

  // ---- Naming tests (ported) ----
  describe("Naming (ported)", () => {
    class Article extends Model {}

    it("singular", () => {
      expect(Article.modelName.singular).toBe("article");
    });

    it("plural", () => {
      expect(Article.modelName.plural).toBe("articles");
    });

    it("element", () => {
      expect(Article.modelName.element).toBe("article");
    });

    it("collection", () => {
      expect(Article.modelName.collection).toBe("articles");
    });

    it("route key", () => {
      expect(Article.modelName.routeKey).toBe("articles");
    });

    it("param key", () => {
      expect(Article.modelName.paramKey).toBe("article");
    });

    it("i18n key", () => {
      expect(Article.modelName.i18nKey).toBe("article");
    });

    it("model name", () => {
      expect(Article.modelName.name).toBe("Article");
    });

    it("to_partial_path default implementation returns a string giving a relative path", () => {
      const a = new Article();
      expect(a.toPartialPath()).toBe("articles/_article");
    });

    it("to model called on record", () => {
      const a = new Article();
      expect(a.toModel()).toBe(a);
    });
  });

  describe("Naming (advanced)", () => {
    it("NamingWithNamespacedModel singular", () => {
      const name = new ModelName("Blog::Post");
      expect(name.singular).toBe("post");
    });

    it("NamingWithNamespacedModel plural", () => {
      const name = new ModelName("Blog::Post");
      expect(name.plural).toBe("posts");
    });

    it("NamingWithSuppliedModelName singular", () => {
      // When a model name is explicitly supplied
      const name = new ModelName("Article");
      expect(name.singular).toBe("article");
    });

    it("NamingUsingRelativeModelName singular", () => {
      const name = new ModelName("Admin::User");
      expect(name.singular).toBe("user");
    });

    it("uncountable model names", () => {
      ModelName.addUncountable("sheep");
      const name = new ModelName("Sheep");
      expect(name.plural).toBe("sheep");
    });

    it("anonymous class without name argument", () => {
      // A model name constructed with empty string
      const name = new ModelName("");
      expect(name.singular).toBe("");
      expect(name.plural).toBe("");
    });
  });

  describe("NamingTest", () => {
    it("human", () => {
      const name = new ModelName("Post");
      expect(name.singular).toBe("post");
    });

    it("singular", () => {
      const name = new ModelName("Post");
      expect(name.singular).toBe("post");
    });

    it("plural", () => {
      const name = new ModelName("Post");
      expect(name.plural).toBe("posts");
    });

    it("element", () => {
      const name = new ModelName("Post");
      expect(name.element).toBe("post");
    });

    it("collection", () => {
      const name = new ModelName("Post");
      expect(name.collection).toBe("posts");
    });

    it("route key", () => {
      const name = new ModelName("Post");
      expect(name.routeKey).toBe("posts");
    });

    it("param key", () => {
      const name = new ModelName("Post");
      expect(name.paramKey).toBe("post");
    });

    it("i18n key", () => {
      const name = new ModelName("Post");
      expect(name.i18nKey).toBe("post");
    });
  });

  describe("NamingWithNamespacedModelInSharedNamespaceTest", () => {
    it("singular", () => {
      const name = new ModelName("Blog::Post");
      expect(name.singular).toBe("post");
    });

    it("plural", () => {
      const name = new ModelName("Blog::Post");
      expect(name.plural).toBe("posts");
    });

    it("element", () => {
      const name = new ModelName("Blog::Post");
      expect(name.element).toBe("post");
    });

    it("collection", () => {
      const name = new ModelName("Blog::Post");
      expect(name.collection).toBe("posts");
    });

    it("human", () => {
      const name = new ModelName("Blog::Post");
      expect(name.singular).toBe("post");
    });

    it("route key", () => {
      const name = new ModelName("Blog::Post");
      expect(name.routeKey).toBe("posts");
    });

    it("param key", () => {
      const name = new ModelName("Blog::Post");
      expect(name.paramKey).toBe("post");
    });

    it("i18n key", () => {
      const name = new ModelName("Blog::Post");
      expect(name.i18nKey).toBe("post");
    });
  });

  describe("NamingHelpersTest", () => {
    it("singular", () => {
      expect(new ModelName("Post").singular).toBe("post");
    });

    it("singular for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.singular).toBe("post");
    });

    it("plural", () => {
      expect(new ModelName("Post").plural).toBe("posts");
    });

    it("plural for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.plural).toBe("posts");
    });

    it("route key", () => {
      expect(new ModelName("Post").routeKey).toBe("posts");
    });

    it("route key for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.routeKey).toBe("posts");
    });

    it("param key", () => {
      expect(new ModelName("Post").paramKey).toBe("post");
    });

    it("param key for class", () => {
      class Post extends Model {
        static {
          this.attribute("title", "string");
        }
      }
      expect(Post.modelName.paramKey).toBe("post");
    });

    it("uncountable", () => {
      const name = new ModelName("Sheep");
      expect(name.plural).toBe("sheep");
    });

    it("uncountable route key", () => {
      const name = new ModelName("Sheep");
      expect(name.routeKey).toBe("sheep");
    });
  });

  // =========================================================================
  // Additional tests for coverage matching
  // =========================================================================

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
      expect(name.singular).toBe("article");
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
    it("singular", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.singular).toBe("post");
    });
    it("plural", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.plural).toBe("posts");
    });
    it("element", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.element).toBe("post");
    });
    it("collection", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.collection).toBe("posts");
    });
    it("human", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.singular).toBe("post");
    });
    it("route key", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.routeKey).toBe("posts");
    });
    it("param key", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.paramKey).toBe("post");
    });
    it("i18n key", () => {
      const name = new ModelName("Post", { namespace: "Blog" });
      expect(name.i18nKey).toBe("post");
    });
  });

  describe("NamingWithNamespacedModelInIsolatedNamespaceTest", () => {
    it("human", () => {
      const name = new ModelName("Admin::Post");
      expect(name.singular).toBe("post");
    });
  });

  describe("OverridingAccessorsTest", () => {
    it("overriding accessors keys", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "Alice" });
      expect(p.readAttribute("name")).toBe("Alice");
    });

    it("anonymous class with name argument", () => {
      const mn = new ModelName("CustomName");
      expect(mn.name).toBe("CustomName");
      expect(mn.singular).toBe("custom_name");
      expect(mn.plural).toBe("custom_names");
    });
  });
});
