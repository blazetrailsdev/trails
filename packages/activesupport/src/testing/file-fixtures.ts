import { ArgumentError, File, format } from "@blazetrails/ruby-compat";
import { included } from "@blazetrails/ruby-compat/include";
import { classAttribute } from "../class-attribute.js";

interface FileFixturesHost {
  fileFixturePath: string | null;
}

export const FileFixtures = {
  [included](base: object): void {
    classAttribute.call(base, "fileFixturePath", { instanceWriter: false });
  },

  fileFixture(this: FileFixturesHost, fixtureName: string): string {
    const path = File.join(this.fileFixturePath!, fixtureName);

    if (File.isExist(path)) {
      return path;
    } else {
      const msg = "the directory '%s' does not contain a file named '%s'";
      throw new ArgumentError(format(msg, this.fileFixturePath, fixtureName));
    }
  },
};
