import { describe, it, expect, afterEach } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { isSqliteRun } from "./support/sqlite-template.js";

registerModel(Post as never);

describe("QueryCache DDL dirties (trails)", () => {
  fixtures(["posts"], { useTransactionalTests: false });

  afterEach(async () => {
    (await Post.leaseConnection()).clearQueryCache();
  });

  it("DDL inside a cache block clears the query cache", async () => {
    const conn = (await Post.leaseConnection()) as never as {
      _queryCache: { clear(): void };
      addColumn(t: string, c: string, ty: string): Promise<void>;
      removeColumn(t: string, c: string): Promise<void>;
    };

    await Post.cache(async () => {
      await Post.find(1);
      const store = conn._queryCache;
      const real = store.clear.bind(store);

      let clears = 0;
      store.clear = () => {
        clears++;
        real();
      };
      try {
        await conn.addColumn("posts", "queryCacheDdlProbe", "string");
        expect(clears).toBe(1);
      } finally {
        store.clear = real;
        await conn.removeColumn("posts", "queryCacheDdlProbe");
      }
    });
  });

  it.skipIf(!isSqliteRun())(
    "sqlite removeIndex and createVirtualTable dirty the query cache",
    async () => {
      const conn = (await Post.leaseConnection()) as never as {
        _queryCache: { clear(): void };
        addIndex(t: string, c: string, o?: Record<string, unknown>): Promise<void>;
        removeIndex(t: string, o: Record<string, unknown>): Promise<void>;
        createVirtualTable(t: string, m: string, v: string[]): Promise<void>;
        dropVirtualTable(t: string, m?: string, v?: string[]): Promise<void>;
      };

      const countClears = async (ddl: () => Promise<void>): Promise<number> => {
        const store = conn._queryCache;
        const real = store.clear.bind(store);
        let clears = 0;
        store.clear = () => {
          clears++;
          real();
        };
        try {
          await ddl();
        } finally {
          store.clear = real;
        }
        return clears;
      };

      await conn.addIndex("posts", "title", { name: "index_posts_ddl_probe" });
      await Post.cache(async () => {
        await Post.find(1);
        const indexClears = await countClears(() =>
          conn.removeIndex("posts", { name: "index_posts_ddl_probe" }),
        );
        expect(indexClears).toBeGreaterThan(0);

        await Post.find(1);
        const virtualClears = await countClears(() =>
          conn.createVirtualTable("ddl_probe_vtable", "fts5", ["title"]),
        );
        try {
          expect(virtualClears).toBeGreaterThan(0);
        } finally {
          await conn.dropVirtualTable("ddl_probe_vtable", "fts5", ["title"]);
        }
      });
    },
  );

  it.skipIf(!isSqliteRun())(
    "sqlite change_column's table rebuild dirties the query cache",
    async () => {
      const conn = (await Post.leaseConnection()) as never as {
        _queryCache: { clear(): void };
        changeColumn(t: string, c: string, ty: string): Promise<void>;
      };

      await Post.cache(async () => {
        await Post.find(1);
        const store = conn._queryCache;
        const real = store.clear.bind(store);
        let clears = 0;
        store.clear = () => {
          clears++;
          real();
        };
        try {
          await conn.changeColumn("posts", "title", "text");
        } finally {
          store.clear = real;
          await conn.changeColumn("posts", "title", "string");
        }
        expect(clears).toBeGreaterThan(0);
      });
    },
  );
});
