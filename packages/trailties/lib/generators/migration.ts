import "../constants.migration.generated.js";
import { NotImplementedError } from "@blazetrails/ruby-compat/not-implemented-error";
import { toS } from "@blazetrails/ruby-compat/object";
import { camelize } from "@blazetrails/activesupport";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { rbModAttrReader } from "@blazetrails/ruby-compat/object";
import { strNew } from "@blazetrails/ruby-compat/string/bytes";
import { rbStrToI } from "@blazetrails/ruby-compat/string/convert";
import { TSE } from "@blazetrails/ruby-compat/tse";
import { rbFBinding } from "@blazetrails/ruby-compat/variable";
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

  isMigrationExists(
    this: { migrationLookupAt(dirname: string): string[] },
    dirname: string,
    fileName: string,
  ): string | undefined {
    const re = new RegExp(`\\d+_${fileName}\\.(ts|js|rb)$`);
    return this.migrationLookupAt(dirname).find((f) => re.test(f));
  },

  currentMigrationNumber(
    this: { migrationLookupAt(dirname: string): string[] },
    dirname: string,
  ): number {
    const max = this.migrationLookupAt(dirname)
      .map((file) => Number(rbStrToI(File.basename(file).split("_")[0])))
      .reduce<number | null>((a, b) => (a == null || b > a ? b : a), null);
    return max ?? 0;
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
    isMigrationExists(dirname: string, fileName: string): string | undefined;
  };
  readonly migrationNumber: string;
  readonly migrationClassName: string;
  _migrationNumber: string;
  _migrationFileName: string;
  _migrationClassName: string;
  createMigration(
    destination: string,
    data: unknown,
    config?: CreateMigrationConfig,
    block?: Exclude<MigrationRenderer, string> | null,
  ): Promise<string | undefined>;
  setMigrationAssignsBang(destination: string): void;
  findInSourcePaths(file: string): Promise<string>;
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
    this._migrationNumber = this.constructor.nextMigrationNumber(migrationDir);
    this._migrationFileName = File.basename(destination, File.extname(destination));
    this._migrationClassName = camelize(this.migrationFileName);
  },

  async migrationTemplate(
    this: MigrationTemplateHost,
    source: string,
    destination: string,
    config: CreateMigrationConfig = {},
  ): Promise<string | undefined> {
    source = File.expandPath(await this.findInSourcePaths(String(source)));

    this.setMigrationAssignsBang(destination);

    const [dir, base] = File.split(destination);
    const numberedDestination = File.join(dir, ["%migration_number%", base].join("_"));

    const file = await this.createMigration(numberedDestination, null, config, async () => {
      const erb = new TSE(strNew(Array.from(await File.binreadAsync(source))), {
        trimMode: "-",
        eoutvar: "@output_buffer",
      });
      erb.filename = source;
      return erb.result(rbFBinding(this));
    });
    return Generators.addGeneratedFile(file!);
  },
};
rbModAttrReader(
  { prototype: Migration },
  "migrationNumber",
  "migrationFileName",
  "migrationClassName",
);
