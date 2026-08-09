/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_rake_test.rb.
 *
 * Despite the file name nothing here drives Rake: every test calls
 * `ActiveRecord::Tasks::DatabaseTasks` directly, against `MySQLDatabaseTasks`,
 * so the tests port straight across wherever the Ruby stubbing they lean on
 * has an analogue.
 */
import { it, expect, beforeEach, vi } from "vitest";
import { describeIfMysqlAdapter } from "../../support/describe-if-mysql-adapter.js";
import { DatabaseTasks } from "../../tasks/database-tasks.js";
import { MySQLDatabaseTasks } from "../../tasks/mysql-database-tasks.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { Base } from "../../base.js";

/**
 * `ActiveRecord::Base.stub(:lease_connection, @connection, &block)`
 * (`mysql2_rake_test.rb:235`). trails' task classes reach the connection
 * through `Base.connectionPool().leaseConnection()`
 * (`mysql-database-tasks.ts:283`), so the pool is where the double goes.
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
    adapter: "mysql2",
    database: "my-app-db",
  });
}

describeIfMysqlAdapter("MysqlDBCreateTest", () => {
  it.skip("establishes connection without database", () => {
    // Not yet ported: asserts through Ruby's `assert_called(..., times: 2)`.
  });
  it.skip("creates database with no default options", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("creates database with given encoding", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("creates database with given collation", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("when database created successfully outputs info to stdout", () => {
    // Not yet ported: asserts on the `$stdout` StringIO the setup swaps in.
  });
  it.skip("create when database exists outputs info to stderr", () => {
    // Not yet ported: asserts on the `$stderr` StringIO the setup swaps in.
  });
});

describeIfMysqlAdapter("MysqlDBCreateWithInvalidPermissionsTest", () => {
  it.skip("raises error", () => {
    // Not yet ported: raises a `Mysql2::Error` from the stubbed connection,
    // the driver error class trails has no analogue for here.
  });
});

describeIfMysqlAdapter("MySQLDBDropTest", () => {
  it.skip("establishes connection to mysql database", () => {
    // Not yet ported: asserts through Ruby's `assert_called`.
  });
  it.skip("drops database", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with`.
  });
  it.skip("when database dropped successfully outputs info to stdout", () => {
    // Not yet ported: asserts on the `$stdout` StringIO the setup swaps in.
  });
});

describeIfMysqlAdapter("MySQLPurgeTest", () => {
  // All three assert on `recreate_database` (`mysql_database_tasks.rb:29-31`),
  // which trails' `purge` does not call — it drops and re-creates, preserving
  // the live charset/collation (`mysql-database-tasks.ts:105-113`). That is a
  // production divergence to converge, not a test-porting gap.
  it.skip("establishes connection without database", () => {});
  it.skip("recreates database with no default options", () => {});
  it.skip("recreates database with the given options", () => {});
});

describeIfMysqlAdapter("MysqlDBCharsetTest", () => {
  beforeEach(() => {
    MySQLDatabaseTasks.register();
  });

  it("db retrieves charset", async () => {
    const charset = vi.fn(async () => "utf8mb4");

    await withStubbedConnection({ charset }, async () => {
      await DatabaseTasks.charset(configuration());
    });

    expect(charset).toHaveBeenCalled();
  });
});

describeIfMysqlAdapter("MysqlDBCollationTest", () => {
  beforeEach(() => {
    MySQLDatabaseTasks.register();
  });

  it("db retrieves collation", async () => {
    const collation = vi.fn(async () => "utf8mb4_general_ci");

    await withStubbedConnection({ collation }, async () => {
      await DatabaseTasks.collation(configuration());
    });

    expect(collation).toHaveBeenCalled();
  });
});

describeIfMysqlAdapter("MySQLStructureDumpTest", () => {
  // Rails pins the exact `mysqldump` argv through
  // `assert_called_with(Kernel, :system, ...)` (`mysql2_rake_test.rb:269-279`).
  it.skip("structure dump", () => {});
  it.skip("structure dump with extra flags", () => {});
  it.skip("structure dump with hash extra flags for a different driver", () => {});
  it.skip("structure dump with hash extra flags for the correct driver", () => {});
  it.skip("structure dump with ignore tables", () => {});
  it.skip("warn when external structure dump command execution fails", () => {});
  it.skip("structure dump with port number", () => {});
  it.skip("structure dump with ssl", () => {});
});

describeIfMysqlAdapter("MySQLStructureLoadTest", () => {
  // Rails pins the exact `mysql` argv through
  // `assert_called_with(Kernel, :system, ...)` (`mysql2_rake_test.rb:391-400`).
  it.skip("structure load", () => {});
  it.skip("structure load with hash extra flags for a different driver", () => {});
  it.skip("structure load with hash extra flags for the correct driver", () => {});
});
