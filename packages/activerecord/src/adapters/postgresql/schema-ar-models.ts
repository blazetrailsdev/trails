import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base, registerModel, modelRegistry } from "../../index.js";

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

export function makeSongAlbumModels(): {
  Song: ModelCtor;
  Album: ModelCtor;
  cleanup: () => void;
} {
  class Song extends Base {
    declare albums: AssociationProxy<Album>;

    static {
      this.tableName = "music.songs";
      this.hasAndBelongsToMany("albums", { joinTable: "music.albums_songs" });
    }
  }
  class Album extends Base {
    static {
      this.tableName = "music.albums";
    }
  }
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
