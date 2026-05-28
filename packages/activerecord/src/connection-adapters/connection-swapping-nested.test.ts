import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { currentRole, currentPreventingWrites } from "../core.js";

describe("ConnectionSwappingNestedTest", () => {
  class PrimaryBase extends Base {
    static override abstractClass = true;
  }

  class SecondaryBase extends Base {
    static override abstractClass = true;
  }

  class TertiaryBase extends Base {
    static override abstractClass = true;
  }

  class NonConnectionAbstractClass extends SecondaryBase {
    static override abstractClass = true;
  }

  class ModelInheritingFromNonConnectionAbstractClass extends NonConnectionAbstractClass {}

  let prevConfigs: unknown;
  let prevDefaultEnv: string;
  let prevCurrent: unknown;

  beforeEach(() => {
    prevConfigs = (Base as any).configurations;
    prevDefaultEnv = DatabaseConfigurations.defaultEnv;
    prevCurrent = (DatabaseConfigurations as any).current;
    DatabaseConfigurations.defaultEnv = "default_env";
  });

  afterEach(() => {
    Base.connectionHandler.clearAllConnectionsBang();
    (Base as any).configurations = prevConfigs;
    DatabaseConfigurations.defaultEnv = prevDefaultEnv;
    (DatabaseConfigurations as any).current = prevCurrent;
    (PrimaryBase as any).connectionClass = false;
    (SecondaryBase as any).connectionClass = false;
    (TertiaryBase as any).connectionClass = false;
  });

  it("roles can be swapped granularly", () => {
    (Base as any).configurations = {
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        primary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary: { adapter: "sqlite3", database: ":memory:" },
        secondary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
      },
    };

    PrimaryBase.connectsTo({ database: { writing: "primary", reading: "primary_replica" } });
    SecondaryBase.connectsTo({ database: { writing: "secondary", reading: "secondary_replica" } });

    Base.connectedTo({ role: "writing" }, () => {
      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");

      PrimaryBase.connectedTo({ role: "reading" }, () => {
        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_replica");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");

        Base.connectedTo({ role: "reading" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_replica");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_replica");

          SecondaryBase.connectedTo({ role: "writing" }, () => {
            expect(currentRole.call(ModelInheritingFromNonConnectionAbstractClass as any)).toBe(
              "writing",
            );
            expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_replica");
            expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
          });

          SecondaryBase.connectedTo({ role: "reading" }, () => {
            expect(currentRole.call(ModelInheritingFromNonConnectionAbstractClass as any)).toBe(
              "reading",
            );
            expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_replica");
            expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_replica");
          });

          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_replica");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_replica");
        });

        Base.connectedTo({ role: "writing" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
        });

        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_replica");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
      });

      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
    });
  });

  it("shards can be swapped granularly", () => {
    (Base as any).configurations = {
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        primary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        primary_shard_one: { adapter: "sqlite3", database: ":memory:" },
        primary_shard_one_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary: { adapter: "sqlite3", database: ":memory:" },
        secondary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary_shard_one: { adapter: "sqlite3", database: ":memory:" },
        secondary_shard_one_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary_shard_two: { adapter: "sqlite3", database: ":memory:" },
        secondary_shard_two_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
      },
    };

    PrimaryBase.connectsTo({
      shards: {
        default: { writing: "primary", reading: "primary_replica" },
        shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
      },
    });

    SecondaryBase.connectsTo({
      shards: {
        default: { writing: "secondary", reading: "secondary_replica" },
        shard_one: { writing: "secondary_shard_one", reading: "secondary_shard_one_replica" },
        shard_two: { writing: "secondary_shard_two", reading: "secondary_shard_two_replica" },
      },
    });

    const globalRole = "writing";

    Base.connectedTo({ role: globalRole, shard: "default" }, () => {
      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");

      PrimaryBase.connectedTo({ shard: "shard_one" }, () => {
        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");

        Base.connectedTo({ shard: "shard_one" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_one");

          SecondaryBase.connectedTo({ shard: "shard_two" }, () => {
            expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
            expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_two");
          });

          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_one");

          Base.connectedTo({ role: globalRole }, () => {
            expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
            expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_one");
          });
        });

        Base.connectedTo({ shard: "default" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
        });

        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
      });

      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
    });
  });

  it("roles and shards can be swapped granularly", () => {
    (Base as any).configurations = {
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        primary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        primary_shard_one: { adapter: "sqlite3", database: ":memory:" },
        primary_shard_one_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary: { adapter: "sqlite3", database: ":memory:" },
        secondary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary_shard_one: { adapter: "sqlite3", database: ":memory:" },
        secondary_shard_one_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary_shard_two: { adapter: "sqlite3", database: ":memory:" },
        secondary_shard_two_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
      },
    };

    PrimaryBase.connectsTo({
      shards: {
        default: { writing: "primary", reading: "primary_replica" },
        shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
      },
    });

    SecondaryBase.connectsTo({
      shards: {
        default: { writing: "secondary", reading: "secondary_replica" },
        shard_one: { writing: "secondary_shard_one", reading: "secondary_shard_one_replica" },
        shard_two: { writing: "secondary_shard_two", reading: "secondary_shard_two_replica" },
      },
    });

    Base.connectedTo({ role: "writing", shard: "default" }, () => {
      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");

      PrimaryBase.connectedTo({ role: "reading", shard: "shard_one" }, () => {
        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");

        Base.connectedTo({ role: "reading", shard: "shard_one" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_one_replica");

          SecondaryBase.connectedTo({ role: "writing", shard: "shard_two" }, () => {
            expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
            expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_two");
          });

          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_one_replica");

          Base.connectedTo({ role: "writing" }, () => {
            expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one");
            expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_shard_one");
          });
        });

        Base.connectedTo({ role: "writing", shard: "default" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
        });

        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
      });

      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
    });
  });

  it("connected to many", () => {
    (Base as any).configurations = {
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        primary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        secondary: { adapter: "sqlite3", database: ":memory:" },
        secondary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        tertiary: { adapter: "sqlite3", database: ":memory:" },
        tertiary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
      },
    };

    PrimaryBase.connectsTo({ database: { writing: "primary", reading: "primary_replica" } });
    SecondaryBase.connectsTo({ database: { writing: "secondary", reading: "secondary_replica" } });
    TertiaryBase.connectsTo({ database: { writing: "tertiary", reading: "tertiary_replica" } });

    Base.connectedTo({ role: "writing", shard: "default" }, () => {
      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
      expect(TertiaryBase.connectionPool().dbConfig.name).toBe("tertiary");

      Base.connectedToMany([SecondaryBase, TertiaryBase], { role: "reading" }, () => {
        expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
        expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_replica");
        expect(TertiaryBase.connectionPool().dbConfig.name).toBe("tertiary_replica");

        Base.connectedToMany([TertiaryBase], { role: "writing" }, () => {
          expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
          expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary_replica");
          expect(TertiaryBase.connectionPool().dbConfig.name).toBe("tertiary");
        });
      });

      expect(PrimaryBase.connectionPool().dbConfig.name).toBe("primary");
      expect(SecondaryBase.connectionPool().dbConfig.name).toBe("secondary");
      expect(TertiaryBase.connectionPool().dbConfig.name).toBe("tertiary");
    });
  });

  it("prevent writes can be changed granularly", () => {
    (Base as any).configurations = {
      default_env: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        primary_replica: { adapter: "sqlite3", database: ":memory:" },
        secondary: { adapter: "sqlite3", database: ":memory:" },
        secondary_replica: { adapter: "sqlite3", database: ":memory:" },
      },
    };

    PrimaryBase.connectsTo({ database: { writing: "primary", reading: "primary_replica" } });
    SecondaryBase.connectsTo({ database: { writing: "secondary", reading: "secondary_replica" } });

    Base.connectedTo({ role: "writing" }, () => {
      expect(currentPreventingWrites.call(Base as any)).toBe(false);
      expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(false);
      expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(false);

      PrimaryBase.connectedTo({ role: "reading" }, () => {
        expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(true);
        expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(false);

        Base.connectedTo({ role: "reading" }, () => {
          expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(true);
          expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(true);

          SecondaryBase.connectedTo({ role: "writing" }, () => {
            expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(true);
            expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(false);
          });

          expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(true);
          expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(true);
        });

        Base.connectedTo({ role: "writing" }, () => {
          expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(false);
          expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(false);
        });

        expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(true);
        expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(false);
      });

      expect(currentPreventingWrites.call(PrimaryBase as any)).toBe(false);
      expect(currentPreventingWrites.call(SecondaryBase as any)).toBe(false);
    });
  });

  it("application record prevent writes can be changed", () => {
    class AppRecord extends Base {
      static override abstractClass = true;
    }

    const prevAppRecord = (globalThis as any).ApplicationRecord;
    (globalThis as any).ApplicationRecord = AppRecord;

    (Base as any).configurations = {
      default_env: {
        arunit: { adapter: "sqlite3", database: ":memory:" },
      },
    };

    try {
      AppRecord.connectsTo({ database: { writing: "arunit", reading: "arunit" } });

      Base.connectedTo({ role: "writing" }, () => {
        expect(currentPreventingWrites.call(Base as any)).toBe(false);
        expect(currentPreventingWrites.call(AppRecord as any)).toBe(false);

        AppRecord.connectedTo({ role: "reading" }, () => {
          expect(currentPreventingWrites.call(AppRecord as any)).toBe(true);
        });

        AppRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
          expect(currentPreventingWrites.call(AppRecord as any)).toBe(true);
        });
      });
    } finally {
      (globalThis as any).ApplicationRecord = prevAppRecord;
    }
  });

  it("prevent writes handles class reloading", () => {
    (Base as any).configurations = {
      default_env: {
        arunit: { adapter: "sqlite3", database: ":memory:" },
      },
    };

    class ReloadedRecordV1 extends Base {
      static override abstractClass = true;
    }
    Object.defineProperty(ReloadedRecordV1, "name", { value: "ReloadedRecord" });

    ReloadedRecordV1.connectsTo({ database: { writing: "arunit", reading: "arunit" } });

    Base.connectedTo({ role: "reading", preventWrites: true }, () => {
      ReloadedRecordV1.connectedTo({ role: "writing", preventWrites: false }, () => {
        expect(currentPreventingWrites.call(ReloadedRecordV1 as any)).toBe(false);
      });
    });

    // emulate a reload in development mode
    Base.connectionHandler.clearAllConnectionsBang();
    (ReloadedRecordV1 as any).connectionClass = false;

    class ReloadedRecordV2 extends Base {
      static override abstractClass = true;
    }
    Object.defineProperty(ReloadedRecordV2, "name", { value: "ReloadedRecord" });

    ReloadedRecordV2.connectsTo({ database: { writing: "arunit", reading: "arunit" } });

    Base.connectedTo({ role: "reading", preventWrites: true }, () => {
      ReloadedRecordV2.connectedTo({ role: "writing", preventWrites: false }, () => {
        expect(currentPreventingWrites.call(ReloadedRecordV2 as any)).toBe(false);
      });
    });
  });
});
