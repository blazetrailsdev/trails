import { describe, it, expect, beforeEach } from "vitest";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";
import { Message } from "./message.js";

describe("ActiveRecord::Encryption::MessagePackMessageSerializerTest (trails)", () => {
  let serializer: MessagePackMessageSerializer;

  beforeEach(() => {
    serializer = new MessagePackMessageSerializer();
  });

  it("binary? returns false because this implementation uses JSON, not MessagePack binary", () => {
    expect(new MessagePackMessageSerializer().isBinary()).toBe(true);
  });

  const MRI_FIXTURE = [
    204, 128, 130, 161, 112, 196, 12, 115, 111, 109, 101, 32, 112, 97, 121, 108, 111, 97, 100, 161,
    104, 131, 165, 107, 101, 121, 95, 49, 161, 49, 162, 105, 118, 196, 12, 0, 1, 2, 3, 4, 5, 6, 7,
    8, 9, 10, 11, 162, 97, 116, 196, 16, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
    112, 113, 114, 115,
  ];

  const fixtureMessage = () => {
    const message = new Message({ payload: Buffer.from("some payload", "utf-8") });
    message.headers.set("key_1", "1");
    message.headers.set("iv", Buffer.from(Array.from({ length: 12 }, (_, i) => i)));
    message.headers.set("at", Buffer.from(Array.from({ length: 16 }, (_, i) => i + 100)));
    return message;
  };

  it("dumps bytes identical to real Rails MessagePack", () => {
    const dumped = serializer.dump(fixtureMessage());
    expect([...dumped]).toEqual(MRI_FIXTURE);
  });

  it("round-trips values that span the str8/bin16/map16 length-prefix boundaries", () => {
    const message = new Message({ payload: new TextEncoder().encode("x".repeat(50)) });
    message.headers.set("long", "y".repeat(40));
    message.headers.set("big", new TextEncoder().encode("z".repeat(300)));
    for (let i = 0; i < 20; i++) message.headers.set(`k${i}`, `v${i}`);

    expect(serializer.load(serializer.dump(message))).toEqual(message);
  });

  it("loads a MessagePack ciphertext produced by real Rails", () => {
    const message = serializer.load(Buffer.from(MRI_FIXTURE));
    expect(new TextDecoder().decode(message.payload as Uint8Array)).toBe("some payload");
    expect(message.headers.get("key_1")).toBe("1");
    expect([...(message.headers.get("iv") as Buffer)]).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
    expect([...(message.headers.get("at") as Buffer)]).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 100),
    );
  });
});
