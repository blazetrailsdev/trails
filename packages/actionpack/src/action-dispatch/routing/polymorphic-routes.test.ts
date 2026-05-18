import { describe, expect, test } from "vitest";
import { ModelName } from "@blazetrails/activemodel";
import {
  HelperMethodBuilder,
  editPolymorphicPath,
  newPolymorphicPath,
  polymorphicPath,
  polymorphicUrl,
  type PolymorphicHost,
  type PolymorphicMappingEntry,
} from "./polymorphic-routes.js";
import { RoutesProxy } from "./routes-proxy.js";
import { urlOptions, type UrlForHost, type UrlForRoutes } from "./url-for.js";

class Post {
  static readonly modelName = new ModelName("Post");
  readonly modelName = Post.modelName;
  constructor(public id: number | null) {}
  toModel(): this {
    return this;
  }
  persisted(): boolean {
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
  persisted(): boolean {
    return this.id != null;
  }
}

function makeHost(): PolymorphicHost {
  const helpers: Record<string, (...args: unknown[]) => string> = {
    post_url: (...args) => `http://example.com/posts/${(args[0] as Post).id}`,
    post_path: (...args) => `/posts/${(args[0] as Post).id}`,
    posts_url: () => "http://example.com/posts",
    posts_path: () => "/posts",
    new_post_path: () => "/posts/new",
    edit_post_path: (...args) => `/posts/${(args[0] as Post).id}/edit`,
    post_comment_path: (...args) =>
      `/posts/${(args[0] as Post).id}/comments/${(args[1] as Comment).id}`,
    post_comments_path: (...args) => `/posts/${(args[0] as Post).id}/comments`,
    admin_post_path: (...args) => `/admin/posts/${(args[0] as Post).id}`,
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
    expect(polymorphicPath.call(host, [Symbol.for("admin"), new Post(1)])).toBe("/admin/posts/1");
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
    host._routes.polymorphicMappings.set("Post", {
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
      post_path: (...args: unknown[]) => {
        seen.push(args);
        return `/mounted/posts/${(args[0] as Post).id}`;
      },
    };
    const routes: UrlForRoutes = { urlFor: () => "" };
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
    // helper invoked through proxy → merged options appended as last arg
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
