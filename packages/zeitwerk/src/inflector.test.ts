import { describe, expect, it } from "vitest";
import { Inflector } from "./inflector.js";

describe("TestInflector", () => {
  const camelize = (str: string) => new Inflector().camelize(str, null);

  it("capitalizes the first letter", () => {
    expect(camelize("user")).toBe("User");
  });

  it("camelizes snake case basenames", () => {
    expect(camelize("users_controller")).toBe("UsersController");
  });

  it("supports segments that do not capitalize", () => {
    expect(camelize("point_3d_value")).toBe("Point3dValue");
  });

  it("knows nothing about acronyms", () => {
    expect(camelize("html_parser")).toBe("HtmlParser");
  });

  it("returns inflections defined using the inflect method", () => {
    const inflections: Record<string, string> = {
      html_parser: "HTMLParser",
      csv_controller: "CSVController",
      mysql_adapter: "MySQLAdapter",
    };

    const inflector = new Inflector();
    inflector.inflect(inflections);

    for (const [basename, cname] of Object.entries(inflections)) {
      expect(inflector.camelize(basename, null)).toBe(cname);
    }

    expect(inflector.camelize("users_controller", null)).toBe("UsersController");
  });
});
