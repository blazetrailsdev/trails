import { describe, expect, test } from "vitest";
import { Conversion, ModelName, Naming } from "@blazetrails/activemodel";
import { extend } from "@blazetrails/activesupport";
import {
  HelperMethodBuilder,
  editPolymorphicPath,
  newPolymorphicPath,
  polymorphicPath,
  polymorphicUrl,
  type PolymorphicHost,
  type PolymorphicMappingEntry,
} from "./polymorphic-routes.js";
import { include } from "@blazetrails/ruby-compat";
import { RoutesProxy } from "./routes-proxy.js";
import { RouteSet } from "./route-set.js";
import { urlOptions, type UrlForHost, type UrlForRoutes } from "./url-for.js";

class Post {
  static readonly modelName = new ModelName("Post");
  readonly modelName = Post.modelName;
  constructor(public id: number | null) {}
  toModel(): this {
    return this;
  }
  isPersisted(): boolean {
    return this.id != null;
  }
}

class Comment {
  static readonly modelName = new ModelName("Comment");
  readonly modelName = Comment.modelName;
  constructor(public id: number | null) {}
  toModel(): this {
    return this;
  }
  isPersisted(): boolean {
    return this.id != null;
  }
}

function makeHost(): PolymorphicHost {
  const helpers: Record<string, (...args: unknown[]) => string> = {
    postUrl: (...args) => `http://example.com/posts/${(args[0] as Post).id}`,
    postPath: (...args) => `/posts/${(args[0] as Post).id}`,
    postsUrl: () => "http://example.com/posts",
    postsPath: () => "/posts",
    newPostPath: () => "/posts/new",
    editPostPath: (...args) => `/posts/${(args[0] as Post).id}/edit`,
    postCommentPath: (...args) =>
      `/posts/${(args[0] as Post).id}/comments/${(args[1] as Comment).id}`,
    postCommentsPath: (...args) => `/posts/${(args[0] as Post).id}/comments`,
    adminPostPath: (...args) => `/admin/posts/${(args[0] as Post).id}`,
  };
  return {
    _routes: { polymorphicMappings: new Map<string, PolymorphicMappingEntry>() },
    ...helpers,
  } as unknown as PolymorphicHost;
}

describe("polymorphicUrl/Path", () => {
  test("persisted record routes to member url", () => {
    const host = makeHost();
    expect(polymorphicUrl.call(host, new Post(1))).toBe("http://example.com/posts/1");
    expect(polymorphicPath.call(host, new Post(1))).toBe("/posts/1");
  });

  test("new record routes to collection", () => {
    const host = makeHost();
    expect(polymorphicPath.call(host, new Post(null))).toBe("/posts");
  });

  test("class routes to collection", () => {
    const host = makeHost();
    expect(polymorphicPath.call(host, Post)).toBe("/posts");
  });

  test("nested array — parent + child", () => {
    const host = makeHost();
    const p = new Post(1);
    expect(polymorphicPath.call(host, [p, new Comment(2)])).toBe("/posts/1/comments/2");
    expect(polymorphicPath.call(host, [p, Comment])).toBe("/posts/1/comments");
  });

  test("symbol namespace prefix", () => {
    const host = makeHost();
    expect(polymorphicPath.call(host, [":admin", new Post(1)])).toBe("/admin/posts/1");
  });

  test("edit/new prefix helpers", () => {
    const host = makeHost();
    expect(editPolymorphicPath.call(host, new Post(1))).toBe("/posts/1/edit");
    expect(newPolymorphicPath.call(host, Post)).toBe("/posts/new");
  });

  test("hash form with :id", () => {
    const host = makeHost();
    const result = polymorphicPath.call(host, { id: new Post(1) });
    expect(result).toBe("/posts/1");
  });

  test("nil / empty array raises ArgumentError", () => {
    const host = makeHost();
    expect(() => polymorphicPath.call(host, null as never)).toThrow(/Nil location/);
    expect(() => polymorphicPath.call(host, [null, undefined] as never)).toThrow(/Nil location/);
  });

  test("string parent in array is rejected", () => {
    const host = makeHost();
    expect(() => polymorphicPath.call(host, ["admin", new Post(1)] as never)).toThrow(/symbols/);
  });

  test("polymorphic_mappings shortcut wins over RESTful dispatch", () => {
    const host = makeHost();
    host._routes.polymorphicMappings!.set("Post", {
      call: (_h, _args, onlyPath) => (onlyPath ? "/custom" : "http://example.com/custom"),
    });
    expect(polymorphicPath.call(host, new Post(1))).toBe("/custom");
    expect(polymorphicUrl.call(host, new Post(1))).toBe("http://example.com/custom");
  });
});

describe("polymorphic dispatch with leading RoutesProxy", () => {
  test("invokes resolved helper on the proxy with merged options", () => {
    const seen: unknown[][] = [];
    const helpers = {
      postPath: (...args: unknown[]) => {
        seen.push(args);
        return `/mounted/posts/${(args[0] as Post).id}`;
      },
    };
    const routes: UrlForRoutes = { urlFor: () => "", isOptimizeRoutesGeneration: () => true };
    const scope: UrlForHost = {
      _routes: routes,
      defaultUrlOptions: { locale: "en" },
      urlOptions() {
        return urlOptions.call(this);
      },
    };
    const proxy = new RoutesProxy(routes, scope, helpers);

    const host = makeHost();
    const out = polymorphicPath.call(host, [proxy, new Post(7)]);
    expect(out).toBe("/mounted/posts/7");
    expect(seen.length).toBe(1);
    const finalArg = seen[0][seen[0].length - 1] as Record<string, unknown>;
    expect(finalArg.locale).toBe("en");
  });
});

describe("HelperMethodBuilder", () => {
  test("CACHE seeded for [null, new, edit] × [path, url]", () => {
    expect(HelperMethodBuilder.path().suffix).toBe("path");
    expect(HelperMethodBuilder.url().suffix).toBe("url");
    expect(HelperMethodBuilder.get("new", "path").prefix).toBe("new_");
    expect(HelperMethodBuilder.get("edit", "url").prefix).toBe("edit_");
  });
});

describe("polymorphic dispatch against a drawn RouteSet", () => {
  class Article {
    static {
      extend(this, Naming);
      include(this, Conversion);
    }
    constructor(public id: number | null) {}
    isPersisted(): boolean {
      return this.id != null;
    }
  }
  const routes = new RouteSet();
  routes.draw((r) => {
    r.resources("articles");
  });
  class Host {}
  include(Host, routes.urlHelpers());
  const host = new Host() as unknown as {
    polymorphicPath(record: unknown): string;
    polymorphicUrl(record: unknown, options: Record<string, unknown>): string;
  };

  test("calls isPersisted and the camelCased named route helper", () => {
    expect(host.polymorphicPath(new Article(1))).toBe("/articles/1");
    expect(host.polymorphicPath(new Article(null))).toBe("/articles");
    expect(host.polymorphicUrl(new Article(1), { host: "example.com" })).toBe(
      "http://example.com/articles/1",
    );
    expect(host.polymorphicUrl(new Article(null), { host: "example.com" })).toBe(
      "http://example.com/articles",
    );
  });
});
