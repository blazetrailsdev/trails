import { describe, it } from "vitest";

describe("TrilogyDBCreateTest", () => {
  it.skip("establishes connection without database", () => {});
  it.skip("creates database with no default options", () => {});
  it.skip("creates database with given encoding", () => {});
  it.skip("creates database with given collation", () => {});
  it.skip("when database created successfully outputs info to stdout", () => {});
  it.skip("create when database exists outputs info to stderr", () => {});
});

describe("MysqlDBCreateWithInvalidPermissionsTest", () => {
  it.skip("raises error", () => {});
});

describe("MySQLDBDropTest", () => {
  it.skip("establishes connection to mysql database", () => {});
  it.skip("drops database", () => {});
  it.skip("when database dropped successfully outputs info to stdout", () => {});
});

describe("MySQLPurgeTest", () => {
  it.skip("establishes connection without database", () => {});
  it.skip("recreates database with no default options", () => {});
  it.skip("recreates database with the given options", () => {});
});

describe("MysqlDBCharsetTest", () => {
  it.skip("db retrieves charset", () => {});
});

describe("MysqlDBCollationTest", () => {
  it.skip("db retrieves collation", () => {});
});

describe("MySQLStructureDumpTest", () => {
  it.skip("structure dump", () => {});
  it.skip("structure dump with extra flags", () => {});
  it.skip("structure dump with hash extra flags for a different driver", () => {});
  it.skip("structure dump with hash extra flags for the correct driver", () => {});
  it.skip("structure dump with ignore tables", () => {});
  it.skip("warn when external structure dump command execution fails", () => {});
  it.skip("structure dump with port number", () => {});
  it.skip("structure dump with ssl", () => {});
});

describe("MySQLStructureLoadTest", () => {
  it.skip("structure load", () => {});
  it.skip("structure load with hash extra flags for a different driver", () => {});
  it.skip("structure load with hash extra flags for the correct driver", () => {});
});
