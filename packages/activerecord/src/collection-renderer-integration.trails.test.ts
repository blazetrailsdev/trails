import { afterEach, describe, expect, it, vi } from "vitest";
import { LookupContext, Renderer } from "@blazetrails/actionview";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";

function commentsLoaded(post: Post): boolean {
  return post.association("comments").loaded;
}

function buildTemplate() {
  return {
    identifier: "posts/_post.html.tse",
    format: ":html",
    virtualPath: "posts/_post",
    render: vi.fn(async (_view: unknown, locals: Record<string, unknown>) => {
      const post = locals.post as Post;
      return `${post.id}:${commentsLoaded(post)};`;
    }),
  };
}

function buildView() {
  return {
    controller: { performCaching: true },
    digestPathFromTemplate: (t: { virtualPath: string }) => `${t.virtualPath}:abc`,
    cacheFragmentName: (name: unknown, { digestPath }: { digestPath?: string | null }) => [
      digestPath,
      name,
    ],
    combinedFragmentCacheKey: (key: unknown) => [":views", key],
  };
}

describe("CollectionRenderer over an ActiveRecord::Relation", () => {
  fixtures(["posts", "comments"]);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes the PreloadCollectionIterator branch and preloads before rendering", async () => {
    const lc = new LookupContext();
    vi.spyOn(lc, "findAll").mockReturnValue([buildTemplate()] as never);

    const relation = Post.preload("comments")
      .where({ id: [1, 2] })
      .order("id");
    const body = await new Renderer(lc).renderPartial({} as never, {
      partial: "posts/post",
      collection: relation as never,
    });

    expect(relation.skipPreloadingValue).toBe(true);
    expect(String(body)).toBe("1:true;2:true;");
  });

  it("preloads before computing a callable cache key", async () => {
    const lc = new LookupContext();
    vi.spyOn(lc, "findAll").mockReturnValue([buildTemplate()] as never);
    const seen: boolean[] = [];

    const relation = Post.preload("comments")
      .where({ id: [1, 2] })
      .order("id");
    await new Renderer(lc).renderPartial(buildView() as never, {
      partial: "posts/post",
      collection: relation as never,
      cached: (item: unknown) => {
        const post = item as Post;
        seen.push(commentsLoaded(post));
        return post.id;
      },
    });

    expect(seen).toEqual([true, true]);
  });
});
