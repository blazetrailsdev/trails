import { describe, it, expect } from "vitest";
import { MessageSerializer } from "./message-serializer.js";
import { Message } from "./message.js";

describe("ActiveRecord::Encryption::MessageSerializerTest (trails)", () => {
  it("encodes non-ASCII string headers as UTF-8 bytes, matching Rails", () => {
    const serializer = new MessageSerializer();
    const message = new Message({ payload: "payload" });
    message.headers.set("tag", "café 😀");
    message.headers.set("latin", "é");
    const dumped = serializer.dump(message);
    const parsed = JSON.parse(dumped) as { h: { tag: string; latin: string } };
    expect(parsed.h.latin).toBe("w6k=");
    expect(parsed.h.tag).toBe(Buffer.from("café 😀", "utf-8").toString("base64"));
    const loaded = serializer.load(dumped);
    expect((loaded.headers.get("tag") as Buffer).toString("utf-8")).toBe("café 😀");
    expect(JSON.parse(serializer.dump(loaded))).toEqual(parsed);
  });

  it("binary? returns false", () => {
    expect(new MessageSerializer().isBinary()).toBe(false);
  });
});
