/**
 * AR model fixtures for schema.test.ts and schema-authorization.test.ts.
 * Each factory builds fresh subclasses so tests are isolated from each other
 * and from the global model registry.
 */
import { Base, registerModel, modelRegistry } from "../../index.js";
import { Associations } from "../../associations.js";
import type { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";

type ModelCtor = typeof Base;

const SCHEMA_NAME = "test_schema";
const SCHEMA2_NAME = "test_schema2";

export async function makeThingModels(
  adapter: PostgreSQLAdapter,
): Promise<{ Thing1: ModelCtor; Thing2: ModelCtor; Thing3: ModelCtor; Thing4: ModelCtor }> {
  class Thing1 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}.things`;
      this.adapter = adapter as any;
    }
  }
  class Thing2 extends Base {
    static {
      this.tableName = `${SCHEMA2_NAME}.things`;
      this.adapter = adapter as any;
    }
  }
  class Thing3 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}."things.table"`;
      this.adapter = adapter as any;
    }
  }
  class Thing4 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}."Things"`;
      this.adapter = adapter as any;
    }
  }
  await Promise.all([Thing1, Thing2, Thing3, Thing4].map((M) => M.loadSchema()));
  return { Thing1, Thing2, Thing3, Thing4 };
}

export function makeThing5Model(adapter: PostgreSQLAdapter): ModelCtor {
  class Thing5 extends Base {
    static {
      this.tableName = "things";
      this.adapter = adapter as any;
    }
  }
  return Thing5 as unknown as ModelCtor;
}

export function makeSchemaThingModel(adapter: PostgreSQLAdapter): ModelCtor {
  class SchemaThing extends Base {
    static {
      this.tableName = "schema_things";
      this.adapter = adapter as any;
    }
  }
  return SchemaThing as unknown as ModelCtor;
}

/**
 * Song/Album models for habtm-with-schema tests.
 * Returns cleanup function to remove the models from the registry.
 */
export function makeSongAlbumModels(adapter: PostgreSQLAdapter): {
  Song: ModelCtor;
  Album: ModelCtor;
  cleanup: () => void;
} {
  class Song extends Base {
    static {
      this.tableName = "music.songs";
      this.adapter = adapter as any;
    }
  }
  class Album extends Base {
    static {
      this.tableName = "music.albums";
      this.adapter = adapter as any;
    }
  }
  // Rails: derive_join_table_name("music.songs", "music.albums") → "music.albums_songs"
  Associations.hasAndBelongsToMany.call(Song, "albums", { joinTable: "music.albums_songs" });
  registerModel("Song", Song);
  registerModel("Album", Album);
  return {
    Song: Song as unknown as ModelCtor,
    Album: Album as unknown as ModelCtor,
    cleanup: () => {
      modelRegistry.delete("Song");
      modelRegistry.delete("Album");
      modelRegistry.delete("Song::HABTM_Albums");
    },
  };
}
