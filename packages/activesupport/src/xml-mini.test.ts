import { describe, it, expect } from "vitest";
import { dasherize, camelize } from "./inflector.js";

describe("HashToXmlTest", () => {
  it.skip(
    "multiple records from xml with attributes other than type ignores them without exploding",
  );
});

describe("ToXmlTest", () => {
  it.skip("to xml dups options");
});

describe("ParsingTest", () => {
  it.skip("symbol");
  it.skip("date");
  it.skip("datetime");
  it.skip("duration");
  it.skip("integer");
  it.skip("float");
  it.skip("decimal");
  it.skip("boolean");
  it.skip("string");
  it.skip("yaml");
  it.skip("hexBinary");
  it.skip("base64Binary and binary");
});

describe("RenameKeyTest", () => {
  // renameKey: transform an underscore_key with dasherize/camelize options
  function renameKey(
    key: string,
    options: { dasherize?: boolean; camelize?: boolean | "lower" | "upper" } = {},
  ): string {
    let result = key;
    if (options.camelize === true || options.camelize === "upper") {
      result = camelize(result, true);
    } else if (options.camelize === "lower") {
      result = camelize(result, false);
    } else if (options.dasherize !== false) {
      // Extract leading/trailing underscores
      const leadingMatch = result.match(/^(_+)/);
      const trailingMatch = result.match(/(_+)$/);
      const leading = leadingMatch ? leadingMatch[1] : "";
      const trailing = trailingMatch ? trailingMatch[1] : "";
      const inner = result.slice(leading.length, result.length - trailing.length);
      result = leading + dasherize(inner) + trailing;
    }
    return result;
  }

  it("rename key dasherizes by default", () => {
    expect(renameKey("hello_world")).toBe("hello-world");
  });

  it("rename key dasherizes with dasherize true", () => {
    expect(renameKey("hello_world", { dasherize: true })).toBe("hello-world");
  });

  it("rename key does nothing with dasherize false", () => {
    expect(renameKey("hello_world", { dasherize: false })).toBe("hello_world");
  });

  it("rename key camelizes with camelize true", () => {
    expect(renameKey("hello_world", { camelize: true })).toBe("HelloWorld");
  });

  it("rename key lower camelizes with camelize lower", () => {
    expect(renameKey("hello_world", { camelize: "lower" })).toBe("helloWorld");
  });

  it("rename key lower camelizes with camelize upper", () => {
    expect(renameKey("hello_world", { camelize: "upper" })).toBe("HelloWorld");
  });

  it("rename key does not dasherize leading underscores", () => {
    expect(renameKey("__hello_world")).toBe("__hello-world");
  });

  it("rename key with leading underscore dasherizes interior underscores", () => {
    expect(renameKey("_hello_world")).toBe("_hello-world");
  });

  it("rename key does not dasherize trailing underscores", () => {
    expect(renameKey("hello_world__")).toBe("hello-world__");
  });

  it("rename key with trailing underscore dasherizes interior underscores", () => {
    expect(renameKey("hello_world_")).toBe("hello-world_");
  });

  it("rename key does not dasherize multiple leading underscores", () => {
    expect(renameKey("___hello_world")).toBe("___hello-world");
  });

  it("rename key does not dasherize multiple trailing underscores", () => {
    expect(renameKey("hello_world___")).toBe("hello-world___");
  });
});

describe("ToTagTest", () => {
  it.skip("#to_tag accepts a callable object and passes options with the builder");

  it.skip("#to_tag accepts a callable object and passes options and tag name");

  it.skip("#to_tag accepts arbitrary objects responding to #to_str");

  it.skip("#to_tag should use the type value in the options hash");

  it.skip("#to_tag accepts symbol types");

  it.skip("#to_tag accepts boolean types");

  it.skip("#to_tag accepts float types");

  it.skip("#to_tag accepts decimal types");

  it.skip("#to_tag accepts date types");

  it.skip("#to_tag accepts datetime types");

  it.skip("#to_tag accepts time types");

  it.skip("#to_tag accepts ActiveSupport::TimeWithZone types");

  it.skip("#to_tag accepts duration types");

  it.skip("#to_tag accepts array types");

  it.skip("#to_tag accepts hash types");

  it.skip("#to_tag should not add type when skip types option is set");

  it.skip("#to_tag should dasherize the space when passed a string with spaces as a key");

  it.skip("#to_tag should dasherize the space when passed a symbol with spaces as a key");
});
