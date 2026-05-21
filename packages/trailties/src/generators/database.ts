// Mirrors railties/lib/rails/generators/database.rb. Ports the Database
// class hierarchy with npm-flavored substitutions (Rails `gem` →
// `pkgDependency`, base/build packages map to apt packages used in the
// Dockerfile template). Rails uses method definitions; we use readonly
// class fields for compactness — behavior is identical.

export const DATABASES = [
  "mysql",
  "trilogy",
  "postgresql",
  "sqlite3",
  "mariadb-mysql",
  "mariadb-trilogy",
] as const;
export type DatabaseName = (typeof DATABASES)[number];

export interface PkgDependency {
  name: string;
  version: string;
}

export interface DockerService {
  image: string;
  restart: string;
  environment?: Record<string, string>;
  volumes?: string[];
  networks?: string[];
}

export abstract class Database {
  abstract readonly name: string;
  abstract readonly template: string;
  abstract readonly pkgDependency: PkgDependency;
  readonly basePackage?: string;
  readonly buildPackage?: string;
  readonly featureName?: string;
  readonly service?: DockerService;
  readonly port?: number;
  readonly socket?: string;
  readonly host?: string;

  get feature(): Record<string, Record<string, never>> | undefined {
    return this.featureName ? { [this.featureName]: {} } : undefined;
  }
  get volume(): string | undefined {
    return this.service ? `${this.name}-data` : undefined;
  }

  static build(name: string): Database {
    switch (name) {
      case "mysql":
        return new MySQL2();
      case "postgresql":
        return new PostgreSQL();
      case "trilogy":
        return new Trilogy();
      case "sqlite3":
        return new SQLite3();
      case "mariadb-mysql":
        return new MariaDBMySQL2();
      case "mariadb-trilogy":
        return new MariaDBTrilogy();
      default:
        return new SQLite3();
    }
  }

  static all(): Database[] {
    return [
      new MySQL2(),
      new PostgreSQL(),
      new SQLite3(),
      new MariaDBMySQL2(),
      new MariaDBTrilogy(),
    ];
  }
}

const mysqlService: DockerService = {
  image: "mysql/mysql-server:8.0",
  restart: "unless-stopped",
  environment: { MYSQL_ALLOW_EMPTY_PASSWORD: "true", MYSQL_ROOT_HOST: "%" },
  volumes: ["mysql-data:/var/lib/mysql"],
  networks: ["default"],
};

const mariaDBService: DockerService = {
  image: "mariadb:10.5",
  restart: "unless-stopped",
  networks: ["default"],
  volumes: ["mariadb-data:/var/lib/mysql"],
  environment: { MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: "true" },
};

export class MySQL2 extends Database {
  readonly name: string = "mysql";
  readonly template: string = "config/databases/mysql.yml";
  readonly pkgDependency: PkgDependency = { name: "mysql2", version: "^3.18.0" };
  override readonly basePackage: string | undefined = "default-mysql-client";
  override readonly buildPackage: string | undefined = "default-libmysqlclient-dev";
  override readonly featureName: string | undefined =
    "ghcr.io/rails/devcontainer/features/mysql-client";
  override readonly service: DockerService | undefined = mysqlService;
  override readonly port: number | undefined = 3306;
  override readonly host: string | undefined = "127.0.0.1";
}

export class PostgreSQL extends Database {
  readonly name = "postgres";
  readonly template = "config/databases/postgresql.yml";
  readonly pkgDependency: PkgDependency = { name: "pg", version: "^8.19.0" };
  override readonly basePackage = "postgresql-client";
  override readonly buildPackage = "libpq-dev";
  override readonly featureName = "ghcr.io/rails/devcontainer/features/postgres-client";
  override readonly port = 5432;
  override readonly service: DockerService = {
    image: "postgres:16.1",
    restart: "unless-stopped",
    networks: ["default"],
    volumes: ["postgres-data:/var/lib/postgresql/data"],
    environment: { POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres" },
  };
}

export class Trilogy extends MySQL2 {
  override readonly template = "config/databases/trilogy.yml";
  override readonly pkgDependency: PkgDependency = { name: "trilogy", version: "^2.7.0" };
  override readonly basePackage = undefined;
  override readonly buildPackage = undefined;
  override readonly featureName = undefined;
}

export class SQLite3 extends Database {
  readonly name = "sqlite3";
  readonly template = "config/databases/sqlite3.yml";
  readonly pkgDependency: PkgDependency = { name: "better-sqlite3", version: "^12.6.0" };
  override readonly basePackage = "sqlite3";
  override readonly featureName = "ghcr.io/rails/devcontainer/features/sqlite3";
}

export class MariaDBMySQL2 extends MySQL2 {
  override readonly name = "mariadb";
  override readonly service = mariaDBService;
}

export class MariaDBTrilogy extends Trilogy {
  override readonly name = "mariadb";
  override readonly service = mariaDBService;
}
