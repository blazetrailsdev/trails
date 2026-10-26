import { describe, expect, it, vi } from "vitest";
import * as LineEditor from "./line-editor.js";

const { basicNew } = vi.hoisted(() => ({ basicNew: vi.fn() }));

vi.mock("./line-editor/basic.js", async (importOriginal) => {
  const { Basic } = await importOriginal<typeof import("./line-editor/basic.js")>();
  return {
    Basic: class extends Basic {
      constructor(prompt: string, options: Record<string, unknown>) {
        super(prompt, options);
        return basicNew(prompt, options);
      }
    },
  };
});

describe("on a system without Readline support", () => {
  describe(".readline", () => {
    it("uses the Basic line editor", async () => {
      const editor = { readline: vi.fn().mockReturnValue("George") };
      basicNew.mockReturnValue(editor);
      expect(await LineEditor.readline("Enter your name ", { default: "Brian" })).toEqual("George");
      expect(basicNew).toHaveBeenCalledWith("Enter your name ", { default: "Brian" });
      expect(editor.readline).toHaveBeenCalled();
    });
  });
});
