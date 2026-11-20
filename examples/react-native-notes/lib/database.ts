import { I18n } from "@blazetrails/activemodel";
import { MigrationProxy, Migrator, type Migration } from "@blazetrails/activerecord";
import { ApplicationRecord } from "../app/models/application-record";
import { CreateNotebooks } from "../db/migrate/20261120120000_create_notebooks";
import { CreateNotes } from "../db/migrate/20261120120100_create_notes";

type MigrationClass = new (name?: string, version?: number) => Migration;

class BundledMigrationProxy extends MigrationProxy {
  constructor(
    private readonly klass: MigrationClass,
    version: number,
  ) {
    super(klass.name, version, `${version}_${klass.name}.ts`, "");
  }

  override async loadMigration(): Promise<Migration> {
    return new this.klass(this.name, this.version);
  }
}

const MIGRATIONS: [MigrationClass, number][] = [
  [CreateNotebooks, 20261120120000],
  [CreateNotes, 20261120120100],
];

export async function connect(config: Record<string, unknown>): Promise<void> {
  await I18n.eagerLoadBang();
  await ApplicationRecord.establishConnection(config);
  const pool = ApplicationRecord.connectionPool();
  const proxies = MIGRATIONS.map(([klass, version]) => new BundledMigrationProxy(klass, version));
  await new Migrator("up", proxies, pool.schemaMigration, pool.internalMetadata).migrate();
}

let queue: Promise<unknown> = Promise.resolve();

export function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}
