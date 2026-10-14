import { beforeEach, describe, it } from "vitest";
import "../test-helpers/active-record-unit.js";
import { Base } from "@blazetrails/activerecord";
import { ModelName } from "@blazetrails/activemodel";
import { assertEqual, assertMatch, assertRaise } from "@blazetrails/activesupport";
import { ActionController, ActionDispatch, RouteSet } from "@blazetrails/actionpack";
import {
  ArgumentError,
  extend,
  include,
  NoMethodError,
  rbModConstSet,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { Project } from "../test-helpers/fixtures/project.js";

class Task extends Base {
  static {
    this.tableName = "projects";
  }
}

class Step extends Base {
  static {
    this.tableName = "projects";
  }
}

class Bid extends Base {
  static {
    this.tableName = "projects";
  }
}

class Tax extends Base {
  static {
    this.tableName = "projects";
  }
}

class Fax extends Base {
  static {
    this.tableName = "projects";
  }
}

class Series extends Base {
  static {
    this.tableName = "projects";
  }
}

class ModelDelegator {
  toModel(): ModelDelegate {
    return new ModelDelegate();
  }
}

class ModelDelegate {
  isPersisted(): boolean {
    return true;
  }

  get modelName(): ModelName {
    return new ModelName(this.constructor);
  }

  toParam(): string {
    return "overridden";
  }
}

const Weblog: { name: string; isUseRelativeModelNaming?: () => boolean } = { name: "Weblog" };
registerConstant("Weblog", Weblog);

class Post extends Base {
  static {
    rbModConstSet(Weblog, "Post", this);
    this.tableName = "projects";
  }
}

class Blog extends Base {
  static {
    rbModConstSet(Weblog, "Blog", this);
    this.tableName = "projects";
  }
}

Weblog.isUseRelativeModelNaming = function (): boolean {
  return true;
};

type Helper = (...args: unknown[]) => string;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Routes.url_helpers` (`polymorphic_routes_test.rb:67`); the class/interface merge is how a mixin surfaces on the type side.
interface PolymorphicRoutesTest {
  _routes: RouteSet;
  defaultUrlOptions: Record<string, unknown>;
  urlOptions(): Record<string, unknown>;
  urlFor: Helper;
  polymorphicUrl: Helper;
  polymorphicPath: Helper;
  newPolymorphicUrl: Helper;
  newPolymorphicPath: Helper;
  editPolymorphicUrl: Helper;
  editPolymorphicPath: Helper;
  projectsUrl: Helper;
  projectsPath: Helper;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class PolymorphicRoutesTest extends ActionController.TestCase {
  static Routes: RouteSet = new RouteSet();

  declare project: Project;
  declare task: Task;
  declare step: Step;
  declare bid: Bid;
  declare tax: Tax;
  declare fax: Fax;
  declare delegator: ModelDelegator;
  declare series: Series;
  declare blogPost: Post;
  declare blogBlog: Blog;

  static {
    this.Routes.draw(function () {});
    include(this, this.Routes.urlHelpers());

    (this as unknown as { defaultUrlOptions: Record<string, unknown> }).defaultUrlOptions["host"] =
      "example.com";
  }

  override setup(): void {
    super.setup();
    this.project = new Project();
    this.task = new Task();
    this.step = new Step();
    this.bid = new Bid();
    this.tax = new Tax();
    this.fax = new Fax();
    this.delegator = new ModelDelegator();
    this.series = new Series();
    this.blogPost = new Post();
    this.blogBlog = new Blog();
  }

  assertUrl(url: string, args: unknown): void {
    const host = (this.constructor as unknown as { defaultUrlOptions: Record<string, unknown> })
      .defaultUrlOptions["host"];

    const prefix = `http://${host}`;
    assertEqual(
      url.startsWith(prefix) ? url.slice(prefix.length) : url,
      this.polymorphicPath(args),
    );
    assertEqual(url, this.polymorphicUrl(args));
    assertEqual(url, this.urlFor(args));
  }

  withNamespacedRoutes<T>(name: string, block: () => T): T {
    return this.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.scope({ module: name }, () => {
          this.resources("blogs", () => {
            this.resources("posts", () => {
              this.resources("faxes");
            });
          });
          this.resources("posts");
        });
      });

      extend(this, this.routes!.urlHelpers());
      return block();
    });
  }

  // eslint-disable-next-line unused-imports/no-unused-vars -- Rails declares `options = {}` and never reads it (`polymorphic_routes_test.rb:655,680,695,717`).
  withTestRoutes<T>(options: Record<string, unknown> = {}, block: () => T): T {
    return this.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.resources("projects", () => {
          this.resources("tasks");
          this.resource("bid", () => {
            this.resources("tasks");
          });
        });
        this.resources("taxes", () => {
          this.resources("faxes");
          this.resource("bid");
        });
        this.resources("series");
        this.resources("model_delegates");
        this.namespace("foo", () => {
          this.resources("model_delegates");
        });
      });

      extend(this, this.routes!.urlHelpers());
      return block();
    });
  }

  // eslint-disable-next-line unused-imports/no-unused-vars -- Rails declares `options = {}` and never reads it (`polymorphic_routes_test.rb:655,680,695,717`).
  withTopLevelAndNestedRoutes<T>(options: Record<string, unknown> = {}, block: () => T): T {
    return this.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.resources("blogs", () => {
          this.resources("posts");
          this.resources("series");
        });
        this.resources("posts");
      });

      extend(this, this.routes!.urlHelpers());
      return block();
    });
  }

  // eslint-disable-next-line unused-imports/no-unused-vars -- Rails declares `options = {}` and never reads it (`polymorphic_routes_test.rb:655,680,695,717`).
  withAdminTestRoutes<T>(options: Record<string, unknown> = {}, block: () => T): T {
    return this.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.namespace("admin", () => {
          this.resources("projects", () => {
            this.resources("tasks");
            this.resource("bid", () => {
              this.resources("tasks");
            });
          });
          this.resources("taxes", () => {
            this.resources("faxes");
          });
          this.resources("series");
        });
      });

      extend(this, this.routes!.urlHelpers());
      return block();
    });
  }

  // eslint-disable-next-line unused-imports/no-unused-vars -- Rails declares `options = {}` and never reads it (`polymorphic_routes_test.rb:655,680,695,717`).
  withAdminAndSiteTestRoutes<T>(options: Record<string, unknown> = {}, block: () => T): T {
    return this.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.namespace("admin", () => {
          this.resources("projects", () => {
            this.namespace("site", () => {
              this.resources("tasks", () => {
                this.resources("steps");
              });
            });
          });
        });
      });

      extend(this, this.routes!.urlHelpers());
      return block();
    });
  }
}

describe("PolymorphicRoutesTest", () => {
  let testCase: PolymorphicRoutesTest;

  beforeEach(async ({ task }) => {
    testCase = new PolymorphicRoutesTest(task.name);
    await testCase.beforeSetup();
    testCase.setup();
  });

  it("string", () => {
    testCase.withTestRoutes(undefined, () => {
      assertEqual("/projects", testCase.polymorphicPath("projects"));
      assertEqual("http://example.com/projects", testCase.polymorphicUrl("projects"));
      assertEqual("projects", testCase.urlFor("projects"));
    });
  });

  it("string with options", () => {
    testCase.withTestRoutes(undefined, () => {
      assertEqual(
        "http://example.com/projects?id=10",
        testCase.polymorphicUrl("projects", { id: 10 }),
      );
    });
  });

  it("symbol", () => {
    testCase.withTestRoutes(undefined, () => {
      testCase.assertUrl("http://example.com/projects", ":projects");
    });
  });

  it("symbol with options", () => {
    testCase.withTestRoutes(undefined, () => {
      assertEqual(
        "http://example.com/projects?id=10",
        testCase.polymorphicUrl(":projects", { id: 10 }),
      );
    });
  });

  it("passing routes proxy", async () => {
    await testCase.withNamespacedRoutes("blog", async () => {
      const proxy = new ActionDispatch.Routing.RoutesProxy(
        testCase._routes,
        testCase,
        testCase._routes.urlHelpers() as unknown as Record<string, unknown>,
      );
      await testCase.blogPost.save();
      testCase.assertUrl(`http://example.com/posts/${testCase.blogPost.id}`, [
        proxy,
        testCase.blogPost,
      ]);
    });
  });

  it("namespaced model", async () => {
    await testCase.withNamespacedRoutes("blog", async () => {
      await testCase.blogPost.save();
      testCase.assertUrl(`http://example.com/posts/${testCase.blogPost.id}`, testCase.blogPost);
    });
  });

  it("namespaced model with name the same as namespace", async () => {
    await testCase.withNamespacedRoutes("blog", async () => {
      await testCase.blogBlog.save();
      testCase.assertUrl(`http://example.com/blogs/${testCase.blogBlog.id}`, testCase.blogBlog);
    });
  });

  it("polymorphic url with 2 objects", async () => {
    await testCase.withNamespacedRoutes("blog", async () => {
      await testCase.blogBlog.save();
      await testCase.blogPost.save();
      assertEqual(
        `http://example.com/blogs/${testCase.blogBlog.id}/posts/${testCase.blogPost.id}`,
        testCase.polymorphicUrl([testCase.blogBlog, testCase.blogPost]),
      );
    });
  });

  it("polymorphic url with 3 objects", async () => {
    await testCase.withNamespacedRoutes("blog", async () => {
      await testCase.blogBlog.save();
      await testCase.blogPost.save();
      await testCase.fax.save();
      assertEqual(
        `http://example.com/blogs/${testCase.blogBlog.id}/posts/${testCase.blogPost.id}/faxes/${testCase.fax.id}`,
        testCase.polymorphicUrl([testCase.blogBlog, testCase.blogPost, testCase.fax]),
      );
    });
  });

  it("namespaced model with nested resources", async () => {
    await testCase.withNamespacedRoutes("blog", async () => {
      await testCase.blogPost.save();
      await testCase.blogBlog.save();
      testCase.assertUrl(
        `http://example.com/blogs/${testCase.blogBlog.id}/posts/${testCase.blogPost.id}`,
        [testCase.blogBlog, testCase.blogPost],
      );
    });
  });

  it("with nil", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      const exception = await assertRaise([ArgumentError], {}, () => {
        testCase.polymorphicUrl(null);
      });
      assertEqual("Nil location provided. Can't build URI.", exception.message);
    });
  });

  it("with empty list", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      const exception = await assertRaise([ArgumentError], {}, () => {
        testCase.polymorphicUrl([]);
      });
      assertEqual("Nil location provided. Can't build URI.", exception.message);
    });
  });

  it("with nil id", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      const exception = await assertRaise([ArgumentError], {}, () => {
        testCase.polymorphicUrl({ id: null });
      });
      assertEqual("Nil location provided. Can't build URI.", exception.message);
    });
  });

  it("with entirely nil list", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      const exception = await assertRaise([ArgumentError], {}, async () => {
        await testCase.series.save();
        testCase.polymorphicUrl([null, null]);
      });
      assertEqual("Nil location provided. Can't build URI.", exception.message);
    });
  });

  it("with nil in list for resource that could be top level or nested", async () => {
    await testCase.withTopLevelAndNestedRoutes(undefined, async () => {
      await testCase.blogPost.save();
      assertEqual(
        `http://example.com/posts/${testCase.blogPost.id}`,
        testCase.polymorphicUrl([null, testCase.blogPost]),
      );
    });
  });

  it("with nil in list does not generate invalid link", async () => {
    await testCase.withTopLevelAndNestedRoutes(undefined, async () => {
      const exception = await assertRaise([NoMethodError], {}, async () => {
        await testCase.series.save();
        testCase.polymorphicUrl([null, testCase.series]);
      });
      assertMatch(/undefined method [`']seriesUrl'/, exception.message);
    });
  });

  it("with record", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      testCase.assertUrl(`http://example.com/projects/${testCase.project.id}`, testCase.project);
    });
  });

  it("with class", () => {
    testCase.withTestRoutes(undefined, () => {
      testCase.assertUrl("http://example.com/projects", testCase.project.constructor);
    });
  });

  it("with class list of one", () => {
    testCase.withTestRoutes(undefined, () => {
      testCase.assertUrl("http://example.com/projects", [testCase.project.constructor]);
    });
  });

  it("class with options", () => {
    testCase.withTestRoutes(undefined, () => {
      assertEqual(
        "http://example.com/projects?foo=bar",
        testCase.polymorphicUrl(testCase.project.constructor, { foo: ":bar" }),
      );
      assertEqual(
        "/projects?foo=bar",
        testCase.polymorphicPath(testCase.project.constructor, { foo: ":bar" }),
      );
    });
  });

  it("with new record", () => {
    testCase.withTestRoutes(undefined, () => {
      testCase.assertUrl("http://example.com/projects", testCase.project);
    });
  });

  it("new record arguments", () => {
    let params: unknown[] | null = null;

    testCase.withTestRoutes(undefined, () => {
      const projectsUrl = testCase.projectsUrl;
      const projectsPath = testCase.projectsPath;
      extend(testCase, {
        projectsUrl(this: PolymorphicRoutesTest, ...args: unknown[]): string {
          params = args;
          return projectsUrl.apply(this, args);
        },

        projectsPath(this: PolymorphicRoutesTest, ...args: unknown[]): string {
          params = args;
          return projectsPath.apply(this, args);
        },
      });

      testCase.assertUrl("http://example.com/projects", testCase.project);
      assertEqual([], params);
    });
  });

  it("with destroyed record", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.destroy();
      testCase.assertUrl("http://example.com/projects", testCase.project);
    });
  });

  it("with record and action", () => {
    testCase.withTestRoutes(undefined, () => {
      assertEqual(
        "http://example.com/projects/new",
        testCase.polymorphicUrl(testCase.project, { action: "new" }),
      );
    });
  });

  it("url helper prefixed with new", () => {
    testCase.withTestRoutes(undefined, () => {
      assertEqual("http://example.com/projects/new", testCase.newPolymorphicUrl(testCase.project));
    });
  });

  it("regression path helper prefixed with new and edit", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      assertEqual("/projects/new", testCase.newPolymorphicPath(testCase.project));

      await testCase.project.save();
      assertEqual(
        `/projects/${testCase.project.id}/edit`,
        testCase.editPolymorphicPath(testCase.project),
      );
    });
  });

  it("url helper prefixed with edit", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      assertEqual(
        `http://example.com/projects/${testCase.project.id}/edit`,
        testCase.editPolymorphicUrl(testCase.project),
      );
    });
  });

  it("url helper prefixed with edit with url options", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      assertEqual(
        `http://example.com/projects/${testCase.project.id}/edit?param1=10`,
        testCase.editPolymorphicUrl(testCase.project, { param1: "10" }),
      );
    });
  });

  it("url helper with url options", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      assertEqual(
        `http://example.com/projects/${testCase.project.id}?param1=10`,
        testCase.polymorphicUrl(testCase.project, { param1: "10" }),
      );
    });
  });

  it("format option", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      assertEqual(
        `http://example.com/projects/${testCase.project.id}.pdf`,
        testCase.polymorphicUrl(testCase.project, { format: ":pdf" }),
      );
    });
  });

  it("format option with url options", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      assertEqual(
        `http://example.com/projects/${testCase.project.id}.pdf?param1=10`,
        testCase.polymorphicUrl(testCase.project, { format: ":pdf", param1: "10" }),
      );
    });
  });

  it("id and format option", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      assertEqual(
        `http://example.com/projects/${testCase.project.id}.pdf`,
        testCase.polymorphicUrl({ id: testCase.project, format: ":pdf" }),
      );
    });
  });

  it("with nested", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      await testCase.task.save();
      testCase.assertUrl(
        `http://example.com/projects/${testCase.project.id}/tasks/${testCase.task.id}`,
        [testCase.project, testCase.task],
      );
    });
  });

  it("with nested unsaved", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      testCase.assertUrl(`http://example.com/projects/${testCase.project.id}/tasks`, [
        testCase.project,
        testCase.task,
      ]);
    });
  });

  it("with nested destroyed", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      await testCase.task.destroy();
      testCase.assertUrl(`http://example.com/projects/${testCase.project.id}/tasks`, [
        testCase.project,
        testCase.task,
      ]);
    });
  });

  it("with nested class", async () => {
    await testCase.withTestRoutes(undefined, async () => {
      await testCase.project.save();
      testCase.assertUrl(`http://example.com/projects/${testCase.project.id}/tasks`, [
        testCase.project,
        testCase.task.constructor,
      ]);
    });
  });
});
