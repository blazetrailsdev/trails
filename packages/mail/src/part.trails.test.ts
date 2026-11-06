import { describe, expect, it } from "vitest";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { Body } from "./body.js";
import "./index.js";
import { AttachmentsList } from "./attachments-list.js";
import { Part } from "./part.js";

describe("mail body and part edges", () => {
  it("answers nil from delivery readers on an ordinary part", () => {
    const part = new Part();
    expect(part.action()).toBeNull();
    expect(part.isBounced()).toBe(false);
  });

  it("raises IndexError for an out of range attachment", () => {
    expect(() => new AttachmentsList([]).get(3)).toThrow(/index 3/);
  });

  it("restores ivars through initWith", () => {
    const body = new Body("x");
    const coder = new YAML.Coder(null);
    coder.setMap({ raw_source: "y", boundary: "b" });
    body.initWith(coder);
    expect(body.rawSource).toBe("y");
    expect(body.boundary).toBe("b");
  });
});
