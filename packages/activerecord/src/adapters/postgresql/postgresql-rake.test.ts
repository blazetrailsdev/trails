/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_rake_test.rb.
 *
 * Despite the file name nothing here drives Rake: every test calls
 * `ActiveRecord::Tasks::DatabaseTasks` directly, against
 * `PostgreSQLDatabaseTasks`, so the tests port straight across wherever the
 * Ruby stubbing they lean on has an analogue.
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfPostgresqlAdapter } from "../../support/describe-if-postgresql-adapter.js";
import { DatabaseTasks } from "../../tasks/database-tasks.js";
import { PostgreSQLDatabaseTasks } from "../../tasks/postgresql-database-tasks.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { Base } from "../../base.js";

/**
 * `with_stubbed_connection` (`postgresql_rake_test.rb:272-274`), which is
 * `ActiveRecord::Base.stub(:lease_connection, @connection, &block)`. trails'
 * task classes reach the connection through
 * `Base.connectionPool().leaseConnection()`
 * (`postgresql-database-tasks.ts:179`), so the pool is where the double goes.
 */
async function withStubbedConnection(
  connection: unknown,
  block: () => Promise<void>,
): Promise<void> {
  const spy = vi.spyOn(Base, "connectionPool").mockReturnValue({
    leaseConnection: async () => connection,
  } as unknown as ReturnType<typeof Base.connectionPool>);
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
}

function configuration(): HashConfig {
  return new HashConfig("default_env", "primary", {
    adapter: "postgresql",
    database: "my-app-db",
  });
}

describeIfPostgresqlAdapter("PostgreSQLDBCreateTest", () => {
  it.skip("establishes connection to postgresql database", () => {
    // Not yet ported: asserts through a `Minitest::Mock` expecting two
    // `establish_connection` calls in order.
  });
  it.skip("creates database with default encoding", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("creates database with given encoding", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("creates database with given collation and ctype", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("establishes connection to new database", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("db create with error prints message", () => {
    // Not yet ported: asserts on the `$stderr` StringIO the setup swaps in.
  });
  it.skip("when database created successfully outputs info to stdout", () => {
    // Not yet ported: asserts on the `$stdout` StringIO the setup swaps in.
  });
  it.skip("create when database exists outputs info to stderr", () => {
    // Not yet ported: asserts on the `$stderr` StringIO the setup swaps in.
  });
});

describeIfPostgresqlAdapter("PostgreSQLDBDropTest", () => {
  it.skip("establishes connection to postgresql database", () => {
    // Not yet ported: asserts through a `Minitest::Mock` expecting two
    // `establish_connection` calls in order.
  });
  it.skip("drops database", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("when database dropped successfully outputs info to stdout", () => {
    // Not yet ported: asserts on the `$stdout` StringIO the setup swaps in.
  });
});

describeIfPostgresqlAdapter("PostgreSQLPurgeTest", () => {
  let connection: {
    createDatabase: ReturnType<typeof vi.fn>;
    dropDatabase: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    connection = {
      createDatabase: vi.fn(async () => {}),
      dropDatabase: vi.fn(async () => {}),
    };
    // `ActiveRecord::Base.stub(:establish_connection, nil)`
    // (`postgresql_rake_test.rb:236`).
    vi.spyOn(Base, "establishConnection").mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof Base.establishConnection>>,
    );
    PostgreSQLDatabaseTasks.register();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears active connections", async () => {
    const clearActiveConnectionsBang = vi.spyOn(
      Base.connectionHandler,
      "clearActiveConnectionsBang",
    );

    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(configuration());
    });

    expect(clearActiveConnectionsBang).toHaveBeenCalled();
  });

  it.skip("establishes connection to postgresql database", () => {
    // Not yet ported: asserts through a `Minitest::Mock` expecting two
    // `establish_connection` calls in order.
  });

  it("drops database", async () => {
    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(configuration());
    });

    expect(connection.dropDatabase).toHaveBeenCalledWith("my-app-db");
  });

  it("creates database", async () => {
    await withStubbedConnection(connection, async () => {
      await DatabaseTasks.purge(configuration());
    });

    expect(connection.createDatabase).toHaveBeenCalledWith("my-app-db", {
      adapter: "postgresql",
      database: "my-app-db",
      encoding: "utf8",
    });
  });

  it.skip("establishes connection", () => {
    // Not yet ported: asserts through a `Minitest::Mock` expecting two
    // `establish_connection` calls in order.
  });
});

describeIfPostgresqlAdapter("PostgreSQLDBCharsetTest", () => {
  beforeEach(() => {
    PostgreSQLDatabaseTasks.register();
  });

  it("db retrieves charset", async () => {
    const encoding = vi.fn(async () => "UTF8");

    await withStubbedConnection({ encoding }, async () => {
      await DatabaseTasks.charset(configuration());
    });

    expect(encoding).toHaveBeenCalled();
  });
});

describeIfPostgresqlAdapter("PostgreSQLDBCollationTest", () => {
  beforeEach(() => {
    PostgreSQLDatabaseTasks.register();
  });

  it("db retrieves collation", async () => {
    const collation = vi.fn(async () => "en_US.UTF-8");

    await withStubbedConnection({ collation }, async () => {
      await DatabaseTasks.collation(configuration());
    });

    expect(collation).toHaveBeenCalled();
  });
});

describeIfPostgresqlAdapter("PostgreSQLStructureDumpTest", () => {
  // Rails pins the exact `pg_dump` argv through
  // `assert_called_with(Kernel, :system, ...)` (`postgresql_rake_test.rb:335-344`).
  it.skip("structure dump", () => {});
  it.skip("structure dump header comments removed", () => {});
  it.skip("structure dump with env", () => {});
  it.skip("structure dump with ssl env", () => {});
  it.skip("structure dump with extra flags", () => {});
  it.skip("structure dump with hash extra flags for a different driver", () => {});
  it.skip("structure dump with hash extra flags for the correct driver", () => {});
  it.skip("structure dump with ignore tables", () => {});
  it.skip("structure dump with schema search path", () => {});
  it.skip("structure dump with schema search path and dump schemas all", () => {});
  it.skip("structure dump with dump schemas string", () => {});
  it.skip("structure dump execution fails", () => {});
});

describeIfPostgresqlAdapter("PostgreSQLStructureLoadTest", () => {
  // Rails pins the exact `psql` argv through
  // `assert_called_with(Kernel, :system, ...)` (`postgresql_rake_test.rb:506-516`).
  it.skip("structure load", () => {});
  it.skip("structure load with extra flags", () => {});
  it.skip("structure load with env", () => {});
  it.skip("structure load with ssl env", () => {});
  it.skip("structure load with hash extra flags for a different driver", () => {});
  it.skip("structure load with hash extra flags for the correct driver", () => {});
  it.skip("structure load accepts path with spaces", () => {});
});
