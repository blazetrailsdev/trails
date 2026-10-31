import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { FileFixtures } from "@blazetrails/activesupport/testing/file-fixtures";
import { Base } from "@blazetrails/activerecord";
import { include, type Included, type Pathname } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import { Blob } from "./blob.js";

type Attributes = { [k: string]: unknown };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FixtureSet extends Included<typeof FileFixtures> {
  fileFixturePath: string | Pathname | null;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FixtureSet {
  declare static fileFixturePath: string | Pathname | null;

  static generateUniqueSecureToken = Base.generateUniqueSecureToken;

  static async blob({
    filename,
    ...attributes
  }: { filename: string } & Attributes): Promise<string> {
    return await new this().prepare(
      new Blob({ filename: filename, key: this.generateUniqueSecureToken() }),
      attributes,
    );
  }

  async prepare(instance: Blob, attributes: Attributes = {}): Promise<string> {
    const io = this.fileFixture(instance.filename.toString()).open();
    instance.unfurl(io);
    instance.assignAttributes(attributes);
    await instance.uploadWithoutUnfurling(io);

    return JSON.stringify(
      Object.fromEntries(
        Object.entries(instance.attributes)
          .map(([key, value]) => [
            key,
            value instanceof HashWithIndifferentAccess ||
            (value != null && Object.getPrototypeOf(value) === Object.prototype)
              ? JSON.stringify(value)
              : value,
          ])
          .filter(([, value]) => value != null),
      ),
    );
  }
}

include(FixtureSet, FileFixtures);

ActiveStorage.FixtureSet = FixtureSet;
