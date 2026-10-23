import { describe, expect, it } from "vitest";
import { MessageBuffer } from "./message-buffer.js";

describe("ActionCable::Connection::MessageBuffer", () => {
  it("buffers until process! and replays in order", () => {
    const received: string[] = [];
    const logged: string[] = [];
    const buffer = new MessageBuffer({
      logger: { error: (message: string) => logged.push(message) },
      receive: (message: string) => received.push(message),
    });
    expect(buffer.isProcessing()).toBeUndefined();
    buffer.append("one");
    buffer.append("two");
    expect(received).toEqual([]);
    buffer.processBang();
    expect(received).toEqual(["one", "two"]);
    buffer.append("three");
    expect(received).toEqual(["one", "two", "three"]);
    buffer.append(new Uint8Array([1]));
    expect(received).toHaveLength(3);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^Couldn't handle non-string message: /);
  });
});
