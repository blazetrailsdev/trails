import { describe, it } from "vitest";

describe("ActiveRecordMessagePackTest", () => {
  it.skip("enshrines type IDs", () => {
    // BLOCKED: serialization — Ruby Marshal / MessagePack round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Marshal.dump/load or msgpack Ruby object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("roundtrips record and cached associations", () => {
    // BLOCKED: serialization — Ruby Marshal / MessagePack round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Marshal.dump/load or msgpack Ruby object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("roundtrips new_record? status", () => {
    // BLOCKED: serialization — Ruby Marshal / MessagePack round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Marshal.dump/load or msgpack Ruby object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("roundtrips binary attribute", () => {
    // BLOCKED: serialization — Ruby Marshal / MessagePack round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Marshal.dump/load or msgpack Ruby object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("raises ActiveSupport::MessagePack::MissingClassError if record class no longer exists", () => {
    // BLOCKED: serialization — Ruby Marshal / MessagePack round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Marshal.dump/load or msgpack Ruby object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});
