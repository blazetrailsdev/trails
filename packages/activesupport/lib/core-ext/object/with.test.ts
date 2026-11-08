import { describe, it, expect, beforeEach } from "vitest";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { objectWith } from "./with.js";
import { assertNotRespondTo } from "../../testing/assertions.js";

class Record {
  publicAttr = "public";
  anotherPublicAttr = "another_public";

  get mixedAttr(): string {
    return this._mixedAttr;
  }

  private _mixedAttr = "mixed";
  #protectedAttr = "protected";
  #privateAttr = "private";

  inspectHidden() {
    return [this.#protectedAttr, this.#privateAttr];
  }
}

describe("WithTest", () => {
  let object: Record;

  beforeEach(() => {
    object = new Record();
  });

  it("sets and restore attributes around a block", () => {
    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");

    objectWith(object as any, { publicAttr: "changed", anotherPublicAttr: "changed_too" }, () => {
      expect(object.publicAttr).toBe("changed");
      expect(object.anotherPublicAttr).toBe("changed_too");
    });

    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");
  });

  it("restore attribute if the block raised", () => {
    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");

    expect(() => {
      objectWith(object as any, { publicAttr: "changed", anotherPublicAttr: "changed_too" }, () => {
        expect(object.publicAttr).toBe("changed");
        expect(object.anotherPublicAttr).toBe("changed_too");
        throw new Error("Oops");
      });
    }).toThrow("Oops");

    expect(object.publicAttr).toBe("public");
    expect(object.anotherPublicAttr).toBe("another_public");
  });

  it("restore attributes if one of the setter raised", () => {
    expect(object.publicAttr).toBe("public");
    expect(object.mixedAttr).toBe("mixed");

    expect(() => {
      objectWith(object as any, { publicAttr: "changed", mixedAttr: "changed_too" }, () => {
        expect(false).toBeTruthy();
      });
    }).toThrow(NoMethodError);

    expect(object.publicAttr).toBe("public");
    expect(object.mixedAttr).toBe("mixed");
  });

  it("only works with public attributes", () => {
    expect(() => {
      objectWith(object as any, { privateAttr: "changed" }, () => {});
    }).toThrow(NoMethodError);
    expect(() => {
      objectWith(object as any, { protectedAttr: "changed" }, () => {});
    }).toThrow(NoMethodError);

    expect(object.mixedAttr).toBe("mixed");
    expect(() => {
      objectWith(object as any, { mixedAttr: "changed" }, () => {});
    }).toThrow(NoMethodError);
    expect(object.mixedAttr).toBe("mixed");
  });

  it("yields the instance to the block", () => {
    const result = objectWith(object as any, { publicAttr: "1" }, (o) => o.publicAttr);
    expect(result).toBe("1");
  });

  it("basic immediates don't respond to #with", () => {
    assertNotRespondTo(null, "with");
    assertNotRespondTo(true, "with");
    assertNotRespondTo(false, "with");
    assertNotRespondTo(1, "with");
    assertNotRespondTo(1.0, "with");
    assertNotRespondTo("sym", "with");
  });
});
