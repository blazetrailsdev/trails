/**
 * AR model fixtures for schema.test.ts and schema-authorization.test.ts.
 * Each factory builds fresh subclasses so tests are isolated from each other
 * and from the global model registry.
 */
import { Base, registerModel, modelRegistry } from "../../index.js";
import { Associations } from "../../associations.js";
import type { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { defineSchema } from "../../test-helpers/define-schema.js";

// The schema-test tables (`test_schema.things`, `music.songs`, …) are
// PG-schema-qualified — defineSchema can't express the cross-schema
// `CREATE TABLE schema.name` shape, so the schema.test.ts setup builds
// them via raw DDL. Callers should await defineSchema(adapter, {}) before
// invoking the factories below so the file participates in the TM-Phase-5
// AR_NO_AUTO_SCHEMA gate.
export async function markPhase5(adapter: PostgreSQLAdapter): Promise<void> {
  await defineSchema(adapter as any, {});
}

type ModelCtor = typeof Base;

const SCHEMA_NAME = "test_schema";
const SCHEMA2_NAME = "test_schema2";

export async function makeThingModels(): Promise<{
  Thing1: ModelCtor;
  Thing2: ModelCtor;
  Thing3: ModelCtor;
  Thing4: ModelCtor;
}> {
  class Thing1 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}.things`;
    }
  }
  class Thing2 extends Base {
    static {
      this.tableName = `${SCHEMA2_NAME}.things`;
    }
  }
  class Thing3 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}."things.table"`;
    }
  }
  class Thing4 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}."Things"`;
    }
  }
  await Promise.all([Thing1, Thing2, Thing3, Thing4].map((M) => M.loadSchema()));
  return { Thing1, Thing2, Thing3, Thing4 };
}

export function makeThing5Model(): ModelCtor {
  class Thing5 extends Base {
    static {
      this.tableName = "things";
    }
  }
  return Thing5 as unknown as ModelCtor;
}

export function makeSchemaThingModel(): ModelCtor {
  class SchemaThing extends Base {
    static {
      this.tableName = "schema_things";
    }
  }
  return SchemaThing as unknown as ModelCtor;
}

/**
 * Song/Album models for habtm-with-schema tests.
 * Returns cleanup function to remove the models from the registry.
 */
export function makeSongAlbumModels(): {
  Song: ModelCtor;
  Album: ModelCtor;
  cleanup: () => void;
} {
  class Song extends Base {
    static {
      this.tableName = "music.songs";
    }
  }
  class Album extends Base {
    static {
      this.tableName = "music.albums";
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
