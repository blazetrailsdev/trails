import { describe, expect, it } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import { RequiredArgumentMissingError } from "../error.js";
import { Argument } from "./argument.js";
import { Arguments } from "./arguments.js";

describe("Thor::Arguments", () => {
  let opt: Arguments;

  function create(opts: Record<string, unknown> = {}): Arguments {
    const arguments_ = Object.entries(opts).map(([type, default_]) => {
      const options = { required: default_ == null, type, default: default_ };
      return new Argument(type, options);
    });

    arguments_.sort((a, b) => (b.name < a.name ? -1 : b.name > a.name ? 1 : 0));
    return (opt = new Arguments(arguments_));
  }

  function parse(...args: unknown[]): Record<string, unknown> {
    return opt.parse(args);
  }

  describe("#parse", () => {
    it("parses arguments in the given order", () => {
      create({ string: null, numeric: null });
      expect(parse("name", "13")["string"]).toEqual("name");
      expect(parse("name", "13")["numeric"]).toEqual(13);
      expect(parse("name", "+13")["numeric"]).toEqual(13);
      expect(parse("name", "+13.3")["numeric"]).toEqual(13.3);
      expect(parse("name", "-13")["numeric"]).toEqual(-13);
      expect(parse("name", "-13.3")["numeric"]).toEqual(-13.3);
    });

    it("accepts hashes", () => {
      create({ string: null, hash: null });
      expect(parse("product", "title:string", "age:integer")["string"]).toEqual("product");
      expect(parse("product", "title:string", "age:integer")["hash"]).toEqual({
        title: "string",
        age: "integer",
      });
      expect(parse("product", "url:http://www.amazon.com/gp/product/123")["hash"]).toEqual({
        url: "http://www.amazon.com/gp/product/123",
      });
    });

    it("accepts arrays", () => {
      create({ string: null, array: null });
      expect(parse("product", "title", "age")["string"]).toEqual("product");
      expect(parse("product", "title", "age")["array"]).toEqual(["title", "age"]);
    });

    it("accepts - as an array argument", () => {
      create({ array: null });
      expect(parse("-")["array"]).toEqual(["-"]);
      expect(parse("-", "title", "-")["array"]).toEqual(["-", "title", "-"]);
    });

    describe("with no inputs", () => {
      it("and no arguments returns an empty hash", () => {
        create();
        expect(parse()).toEqual({});
      });

      it("and required arguments raises an error", async () => {
        create({ string: null, numeric: null });
        await assertRaises(
          [RequiredArgumentMissingError],
          { match: /^No value provided for required arguments 'string', 'numeric'$/ },
          () => parse(),
        );
      });

      it("and default arguments returns default values", () => {
        create({ string: "name", numeric: 13 });
        expect(parse()).toEqual({ string: "name", numeric: 13 });
      });
    });

    it("returns the input if it's already parsed", () => {
      create({ string: null, hash: null, array: null, numeric: null });
      expect(parse("", 0, {}, [])).toEqual({ string: "", numeric: 0, hash: {}, array: [] });
    });

    it("returns the default value if none is provided", () => {
      create({ string: "foo", numeric: 3.0 });
      expect(parse("bar")).toEqual({ string: "bar", numeric: 3.0 });
    });
  });
});
