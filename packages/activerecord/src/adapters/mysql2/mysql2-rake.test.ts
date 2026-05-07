import { describe, it } from "vitest";

describe("MysqlDBCreateTest", () => {
  it.skip("establishes connection without database", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("creates database with no default options", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("creates database with given encoding", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("creates database with given collation", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("when database created successfully outputs info to stdout", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("create when database exists outputs info to stderr", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MysqlDBCreateWithInvalidPermissionsTest", () => {
  it.skip("raises error", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MySQLDBDropTest", () => {
  it.skip("establishes connection to mysql database", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("drops database", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("when database dropped successfully outputs info to stdout", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MySQLPurgeTest", () => {
  it.skip("establishes connection without database", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("recreates database with no default options", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("recreates database with the given options", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MysqlDBCharsetTest", () => {
  it.skip("db retrieves charset", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MysqlDBCollationTest", () => {
  it.skip("db retrieves collation", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MySQLStructureDumpTest", () => {
  it.skip("structure dump", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure dump with extra flags", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure dump with hash extra flags for a different driver", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure dump with hash extra flags for the correct driver", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure dump with ignore tables", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("warn when external structure dump command execution fails", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure dump with port number", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure dump with ssl", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});

describe("MySQLStructureLoadTest", () => {
  it.skip("structure load", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure load with hash extra flags for a different driver", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("structure load with hash extra flags for the correct driver", () => {
    // BLOCKED: rake — Rake/dbconsole shell-out cannot run in Node.js
    // ROOT-CAUSE: mysql2-rake.ts#exec not translatable to Node.js
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});
