import { describe, expect, it } from "vitest";
import { scanBareRaises } from "./rails-bare-raises.js";

describe("scanBareRaises", () => {
  it("records a bare raise under the method's TS spellings", () => {
    const ruby = `
      def dump(message)
        raise Errors::ForbiddenClass unless message.is_a?(Message)
      end

      def table_exists?
        raise(NotImplementedError)
      end

      def check!
        raise ArgumentError.new
      end
    `;
    expect(scanBareRaises(ruby)).toEqual({
      dump: ["ForbiddenClass"],
      isTableExists: ["NotImplementedError"],
      tableExists: ["NotImplementedError"],
      checkBang: ["ArgumentError"],
    });
  });

  it("leaves out a raise that carries a message", () => {
    const ruby = `
      def a
        raise ArgumentError, "no"
      end

      def b
        raise ArgumentError.new("no")
      end

      def c
        raise ArgumentError,
          "no"
      end

      def d
        raise "no"
      end
    `;
    expect(scanBareRaises(ruby)).toEqual({});
  });

  it("leaves out a class one method raises both ways, and same-named methods of two classes", () => {
    const ruby = `
      class TypeMap
        def register_type(key)
          raise ::ArgumentError unless key
          raise KeyError
        end
      end

      class HashLookupTypeMap
        def register_type(key)
          raise ::ArgumentError, "key is required" unless key
        end
      end
    `;
    expect(scanBareRaises(ruby)).toEqual({ registerType: ["KeyError"] });
  });

  it("skips comments and raises outside a method", () => {
    const ruby = `
      # raise ArgumentError
      raise LoadError unless defined?(Foo)
    `;
    expect(scanBareRaises(ruby)).toEqual({});
  });
});
