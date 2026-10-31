import { ArgumentError, File, Pathname, format } from "@blazetrails/ruby-compat";
import { included } from "@blazetrails/ruby-compat/include";
import { classAttribute } from "../class-attribute.js";

interface FileFixturesHost {
  fileFixturePath: string | Pathname | null;
}

export const FileFixtures = {
  [included](base: object): void {
    classAttribute.call(base, "fileFixturePath", { instanceWriter: false });
  },

  fileFixture(this: FileFixturesHost, fixtureName: string | Pathname): Pathname {
    const path = new Pathname(File.join(this.fileFixturePath!, fixtureName));

    if (path.isExist()) {
      return path;
    } else {
      const msg = "the directory '%s' does not contain a file named '%s'";
      throw new ArgumentError(format(msg, this.fileFixturePath, fixtureName));
    }
  },
};
