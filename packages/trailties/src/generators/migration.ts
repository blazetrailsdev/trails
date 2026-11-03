import { NotImplementedError, toS } from "@blazetrails/ruby-compat";
import { camelize } from "@blazetrails/activesupport";
import { Dir, File, regexpEscape } from "@blazetrails/ruby-compat";
import {
  CreateMigration,
  type CreateMigrationConfig,
  type CreateMigrationHost,
  type MigrationRenderer,
} from "./actions/create-migration.js";
import { Generators } from "../generators.js";

export { NotImplementedError };

export const ClassMethods = {
  migrationLookupAt(dirname: string): string[] {
    return Dir.glob(`${dirname}/[0-9]*_*.{ts,js,rb}`);
  },

  migrationExists(
    this: { migrationLookupAt(dirname: string): string[] },
    dirname: string,
    fileName: string,
  ): string | undefined {
    const re = new RegExp(`\\d+_${regexpEscape(fileName)}\\.(ts|js|rb)$`);
    return this.migrationLookupAt(dirname).find((f) => re.test(f));
  },

  currentMigrationNumber(
    this: { migrationLookupAt(dirname: string): string[] },
    dirname: string,
  ): number {
    return Math.max(
      0,
      ...this.migrationLookupAt(dirname).map(
        (file) => parseInt(File.basename(file).split("_")[0], 10) || 0,
      ),
    );
  },

  nextMigrationNumber(_dirname: string): never {
    throw new NotImplementedError();
  },
};

export interface MigrationTemplateHost extends CreateMigrationHost {
  action(instance: CreateMigration): unknown;
  destinationRoot: string;
  constructor: {
    nextMigrationNumber(dirname: string): string;
    migrationExists(dirname: string, fileName: string): string | undefined;
  };
  migrationNumber: string;
  migrationClassName: string;
  createMigration(
    destination: string,
    data: unknown,
    config?: CreateMigrationConfig,
    block?: Exclude<MigrationRenderer, string> | null,
  ): Promise<string | undefined>;
  setMigrationAssignsBang(destination: string): void;
}

export const Migration = {
  createMigration(
    this: MigrationTemplateHost,
    destination: string,
    data: unknown,
    config: CreateMigrationConfig = {},
    block: Exclude<MigrationRenderer, string> | null = null,
  ): Promise<string | undefined> {
    return this.action(
      new CreateMigration(this, destination, block || toS(data), config),
    ) as Promise<string | undefined>;
  },

  /** @missingRailsArgs basename — PERMANENT */
  setMigrationAssignsBang(this: MigrationTemplateHost, destination: string): void {
    destination = File.expandPath(destination, this.destinationRoot);

    const migrationDir = File.dirname(destination);
    this.migrationNumber = this.constructor.nextMigrationNumber(migrationDir);
    this.migrationFileName = File.basename(destination, File.extname(destination));
    this.migrationClassName = camelize(this.migrationFileName);
  },

  /** @missingRailsCall find_in_source_paths — CONVERGEABLE migration-template-expands-the-source-template-path */
  async migrationTemplate(
    this: MigrationTemplateHost,
    source: () => string | Promise<string>,
    destination: string,
    config: CreateMigrationConfig = {},
  ): Promise<string | undefined> {
    this.setMigrationAssignsBang(destination);

    const [dir, base] = File.split(destination);
    const numberedDestination = File.join(dir, ["%migration_number%", base].join("_"));

    const file = await this.createMigration(numberedDestination, null, config, source);
    return Generators.addGeneratedFile(file!);
  },
};
