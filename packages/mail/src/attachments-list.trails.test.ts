import { describe, expect, it } from "vitest";
import { AttachmentsList } from "./attachments-list.js";
import "./index.js";
import type { Part } from "./part.js";

const part = (filename: string, attachment = true) =>
  ({
    mimeType: () => "text/plain",
    parts: [],
    isAttachment: () => attachment,
    filename: () => filename,
  }) as unknown as Part;

describe("AttachmentsList", () => {
  it("keeps only attachment parts and reads by index or filename", () => {
    const list = new AttachmentsList([part("a.txt"), part("b.txt", false), part("c.txt")]);
    expect(list.length).toBe(2);
    expect(list.get(1)!.filename()).toBe("c.txt");
    expect(list.get("a.txt")!.filename()).toBe("a.txt");
    expect(list.get("nope.txt")).toBeNull();
  });

  it("guesses a mime type and encoding from the filename", () => {
    const list = new AttachmentsList([]);
    expect(list.setMimeType("test.png")).toBe("image/png");
    expect(list.guessEncoding()).toBe("binary");
    expect(list.setMimeType("test.txt")).toBe("text/plain");
    expect(list.guessEncoding()).toBe("7bit");
  });

  it("refuses an unknown transfer encoding", async () => {
    await expect(
      new AttachmentsList([]).set("t.png", { content: "x", encoding: "weird_encoding" }),
    ).rejects.toThrow(/Do not know how to handle Content Transfer Encoding weird_encoding/);
  });
});
