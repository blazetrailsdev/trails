import { describe, it, expect, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";

describe("Migration", () => {
  describe("CreateJoinTableTest", () => {
    afterEach(async () => {
      const connection = await ambientConnection();
      for (const tableName of ["artists_musics", "musics_videos", "catalog"]) {
        await connection.dropTable(tableName, { ifExists: true });
      }
    });

    async function withTableCleanup(body: () => Promise<void>): Promise<void> {
      const connection = await ambientConnection();
      const tablesBefore = await connection.dataSources();

      try {
        await body();
      } finally {
        const tablesAfter = (await connection.dataSources()).filter(
          (table) => !tablesBefore.includes(table),
        );

        for (const table of tablesAfter) {
          await connection.dropTable(table);
        }
      }
    }

    it("create join table", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");

      expect((await connection.columns("artists_musics")).map((c) => c.name).sort()).toEqual([
        "artist_id",
        "music_id",
      ]);
    });

    it("create join table set not null by default", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");

      expect((await connection.columns("artists_musics")).map((c) => c.null)).toEqual([
        false,
        false,
      ]);
    });

    it("create join table with strings", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");

      expect((await connection.columns("artists_musics")).map((c) => c.name).sort()).toEqual([
        "artist_id",
        "music_id",
      ]);
    });

    it("create join table with symbol and string", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");

      expect((await connection.columns("artists_musics")).map((c) => c.name).sort()).toEqual([
        "artist_id",
        "music_id",
      ]);
    });

    it("create join table with the proper order", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("videos", "musics");

      expect((await connection.columns("musics_videos")).map((c) => c.name).sort()).toEqual([
        "music_id",
        "video_id",
      ]);
    });

    it("create join table with the table name", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { tableName: "catalog" });

      expect((await connection.columns("catalog")).map((c) => c.name).sort()).toEqual([
        "artist_id",
        "music_id",
      ]);
    });

    it("create join table with the table name as string", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { tableName: "catalog" });

      expect((await connection.columns("catalog")).map((c) => c.name).sort()).toEqual([
        "artist_id",
        "music_id",
      ]);
    });

    it("create join table with column options", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { columnOptions: { null: true } });

      expect((await connection.columns("artists_musics")).map((c) => c.null)).toEqual([true, true]);
    });

    it("create join table without indexes", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");

      expect(await connection.indexes("artists_musics")).toEqual([]);
    });

    it("create join table with index", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", (t) => {
        t.index(["artist_id", "music_id"]);
      });

      expect((await connection.indexes("artists_musics")).map((i) => i.columns)).toEqual([
        ["artist_id", "music_id"],
      ]);
    });

    it("create join table respects reference key type", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", (t) => {
        t.references("video");
      });

      const [artistId, musicId, videoId] = (await connection.columns("artists_musics")).sort(
        (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      );

      expect(artistId.sqlType).toBe(videoId.sqlType);
      expect(musicId.sqlType).toBe(videoId.sqlType);
    });

    it("drop join table", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");
      await connection.dropJoinTable("artists", "musics");

      expect(await connection.tableExists("artists_musics")).toBeFalsy();
    });

    it("drop join table with strings", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics");
      await connection.dropJoinTable("artists", "musics");

      expect(await connection.tableExists("artists_musics")).toBeFalsy();
    });

    it("drop join table with the proper order", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("videos", "musics");
      await connection.dropJoinTable("videos", "musics");

      expect(await connection.tableExists("musics_videos")).toBeFalsy();
    });

    it("drop join table with the table name", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { tableName: "catalog" });
      await connection.dropJoinTable("artists", "musics", { tableName: "catalog" });

      expect(await connection.tableExists("catalog")).toBeFalsy();
    });

    it("drop join table with the table name as string", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { tableName: "catalog" });
      await connection.dropJoinTable("artists", "musics", { tableName: "catalog" });

      expect(await connection.tableExists("catalog")).toBeFalsy();
    });

    it("drop join table with drop table options", async () => {
      const connection = await ambientConnection();
      expect(await connection.tableExists("artists_musics")).toBeFalsy();
      await expect(
        connection.dropJoinTable("artists", "musics", { ifExists: true }),
      ).resolves.not.toThrow();
    });

    it("drop join table with column options", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { columnOptions: { null: true } });
      await connection.dropJoinTable("artists", "musics", { columnOptions: { null: true } });

      expect(await connection.tableExists("artists_musics")).toBeFalsy();
    });

    it("create and drop join table with common prefix", async () => {
      const connection = await ambientConnection();
      await withTableCleanup(async () => {
        await connection.createJoinTable("audio_artists", "audio_musics");
        expect(await connection.tableExists("audio_artists_musics")).toBeTruthy();

        await connection.dropJoinTable("audio_artists", "audio_musics");
        expect(await connection.tableExists("audio_artists_musics")).toBeFalsy();
      });
    });

    it.skipIf(adapterType !== "postgres")("create join table with uuid", async () => {
      const connection = await ambientConnection();
      await connection.createJoinTable("artists", "musics", { columnOptions: { type: "uuid" } });
      expect((await connection.columns("artists_musics")).map((c) => c.type)).toEqual([
        "uuid",
        "uuid",
      ]);
    });
  });
});
