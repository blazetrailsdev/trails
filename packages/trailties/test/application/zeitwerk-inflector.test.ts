import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Inflections, inflections } from "@blazetrails/activesupport";
import { rbObjDup } from "@blazetrails/ruby-compat/include";
import { Inflector } from "../../lib/autoloaders/inflector.js";

const INFLECTOR = Inflector;

describe("ZeitwerkInflectorTest", () => {
  const instances = (Inflections as unknown as { instances: Map<string, Inflections> }).instances;
  let originalInflections: Inflections;

  function resetOverrides(): void {
    const overrides = INFLECTOR.overrides() as Record<string, string>;
    for (const key of Object.keys(overrides)) delete overrides[key];
  }

  function camelize(basename: string): string {
    return INFLECTOR.camelize(basename, null as unknown as string);
  }

  beforeEach(() => {
    resetOverrides();
    originalInflections = Inflections.instance("en");
    instances.set("en", rbObjDup(originalInflections));
  });

  afterEach(() => {
    resetOverrides();
    instances.set("en", originalInflections);
  });

  it("it camelizes regular basenames with String#camelize", () => {
    inflections("en", (inflect) => {
      inflect.acronym("SSL");
    });

    expect(camelize("user")).toBe("User");
    expect(camelize("users_controller")).toBe("UsersController");
    expect(camelize("point_3d")).toBe("Point3d");
    expect(camelize("ssl_error")).toBe("SSLError");
  });

  it("overrides take precedence", () => {
    expect(camelize("mysql_adapter")).toBe("MysqlAdapter");

    INFLECTOR.inflect({ mysql_adapter: "MySQLAdapter" });
    expect(camelize("mysql_adapter")).toBe("MySQLAdapter");

    expect(camelize("users_controller")).toBe("UsersController");
  });
});
