import { describe, it, expect } from "vitest";
import { rbModName, rbObjClassname } from "@blazetrails/ruby-compat/object";
import { ConfigurationFile, FormatError } from "../lib/configuration-file.js";

describe("ConfigurationFile class paths", () => {
  it("names ConfigurationFile and FormatError by their Ruby paths", () => {
    expect(rbModName(ConfigurationFile)).toBe("ActiveSupport::ConfigurationFile");
    expect(rbModName(FormatError)).toBe("ActiveSupport::ConfigurationFile::FormatError");
    expect(rbObjClassname(new FormatError())).toBe("ActiveSupport::ConfigurationFile::FormatError");
  });
});
