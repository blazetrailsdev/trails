import { afterEach, describe, expect, it } from "vitest";
import {
  Base,
  FixtureResolver,
  LookupContext,
  Renderer,
  TemplateHandlers,
  TseHandler,
} from "@blazetrails/actionview";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";

function commentsLoaded(post: Post): boolean {
  return post.association("comments").loaded;
}

function buildLookupContext(): LookupContext {
  TemplateHandlers.registerTemplateHandler("tse", new TseHandler());
  return new LookupContext(
    [
      new FixtureResolver({
        "posts/_post.html.tse": '<%= post.id %>:<%= post.association("comments").loaded %>;',
      }),
    ],
    {},
    [],
  );
}

function buildView(lc: LookupContext) {
  return Object.assign(new (Base.withEmptyTemplateCache())(lc, {}, null), {
    controller: { performCaching: true },
    digestPathFromTemplate: (t: { virtualPath: string }) => `${t.virtualPath}:abc`,
    cacheFragmentName: (name: unknown, { digestPath }: { digestPath?: string | null }) => [
      digestPath,
      name,
    ],
    combinedFragmentCacheKey: (key: unknown) => [":views", key],
  });
}

describe("CollectionRenderer over an ActiveRecord::Relation", () => {
  fixtures(["posts", "comments"]);

  afterEach(() => {
    TemplateHandlers.unregisterTemplateHandler("tse");
  });

  it("takes the PreloadCollectionIterator branch and preloads before rendering", async () => {
    const lc = buildLookupContext();

    const relation = Post.preload("comments")
      .where({ id: [1, 2] })
      .order("id");
    const body = await new Renderer(lc).renderPartial(
      new (Base.withEmptyTemplateCache())(lc, {}, null) as never,
      {
        partial: "posts/post",
        collection: relation as never,
      },
    );

    expect(relation.skipPreloadingValue).toBe(true);
    expect(String(body)).toBe("1:true;2:true;");
  });

  it("preloads before computing a callable cache key", async () => {
    const lc = buildLookupContext();
    const seen: boolean[] = [];

    const relation = Post.preload("comments")
      .where({ id: [1, 2] })
      .order("id");
    await new Renderer(lc).renderPartial(buildView(lc) as never, {
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
