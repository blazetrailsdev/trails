// Mirrors railties/lib/rails/generators/database.rb. Ports the Database
// class hierarchy with npm-flavored substitutions (Rails `gem` →
// `pkgDependency`, base/build packages map to apt packages used in the
// Dockerfile template). Trilogy and MariaDB variants are kept for parity
// even though the wave-1 adapter set is sqlite/postgres/mysql.

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
  abstract get name(): string;
  abstract get template(): string;
  abstract get pkgDependency(): PkgDependency;
  get basePackage(): string | undefined {
    return undefined;
  }
  get buildPackage(): string | undefined {
    return undefined;
  }
  get featureName(): string | undefined {
    return undefined;
  }
  get service(): DockerService | undefined {
    return undefined;
  }
  get port(): number | undefined {
    return undefined;
  }
  get socket(): string | undefined {
    return undefined;
  }
  get host(): string | undefined {
    return undefined;
  }

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
  get name(): string {
    return "mysql";
  }
  get template(): string {
    return "config/databases/mysql.yml";
  }
  get pkgDependency(): PkgDependency {
    return { name: "mysql2", version: "^3.18.0" };
  }
  override get basePackage(): string | undefined {
    return "default-mysql-client";
  }
  override get buildPackage(): string | undefined {
    return "default-libmysqlclient-dev";
  }
  override get featureName(): string | undefined {
    return "ghcr.io/rails/devcontainer/features/mysql-client";
  }
  override get service(): DockerService | undefined {
    return mysqlService;
  }
  override get port(): number | undefined {
    return 3306;
  }
  override get host(): string | undefined {
    return "127.0.0.1";
  }
}

export class PostgreSQL extends Database {
  get name(): string {
    return "postgres";
  }
  get template(): string {
    return "config/databases/postgresql.yml";
  }
  get pkgDependency(): PkgDependency {
    return { name: "pg", version: "^8.19.0" };
  }
  override get basePackage(): string | undefined {
    return "postgresql-client";
  }
  override get buildPackage(): string | undefined {
    return "libpq-dev";
  }
  override get featureName(): string | undefined {
    return "ghcr.io/rails/devcontainer/features/postgres-client";
  }
  override get port(): number | undefined {
    return 5432;
  }
  override get service(): DockerService | undefined {
    return {
      image: "postgres:16.1",
      restart: "unless-stopped",
      networks: ["default"],
      volumes: ["postgres-data:/var/lib/postgresql/data"],
      environment: { POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres" },
    };
  }
}

export class Trilogy extends MySQL2 {
  override get template(): string {
    return "config/databases/trilogy.yml";
  }
  override get pkgDependency(): PkgDependency {
    return { name: "trilogy", version: "^2.7.0" };
  }
  override get basePackage(): string | undefined {
    return undefined;
  }
  override get buildPackage(): string | undefined {
    return undefined;
  }
  override get featureName(): string | undefined {
    return undefined;
  }
}

export class SQLite3 extends Database {
  get name(): string {
    return "sqlite3";
  }
  get template(): string {
    return "config/databases/sqlite3.yml";
  }
  get pkgDependency(): PkgDependency {
    return { name: "better-sqlite3", version: "^12.6.0" };
  }
  override get basePackage(): string | undefined {
    return "sqlite3";
  }
  override get featureName(): string | undefined {
    return "ghcr.io/rails/devcontainer/features/sqlite3";
  }
}

export class MariaDBMySQL2 extends MySQL2 {
  override get name(): string {
    return "mariadb";
  }
  override get service(): DockerService | undefined {
    return mariaDBService;
  }
}

export class MariaDBTrilogy extends Trilogy {
  override get name(): string {
    return "mariadb";
  }
  override get service(): DockerService | undefined {
    return mariaDBService;
  }
}
