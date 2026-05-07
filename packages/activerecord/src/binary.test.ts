import { describe, it } from "vitest";

describe("BinaryTest", () => {
  it.skip("mixed encoding", () => {
    // BLOCKED: serialization — Ruby encoding / YAML round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Encoding::ASCII_8BIT or Ruby Marshal/YAML object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("load save", () => {
    // BLOCKED: serialization — Ruby encoding / YAML round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Encoding::ASCII_8BIT or Ruby Marshal/YAML object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("unicode input casting", () => {
    // BLOCKED: serialization — Ruby encoding / YAML round-trip, no Node.js equivalent
    // ROOT-CAUSE: Node.js has no Encoding::ASCII_8BIT or Ruby Marshal/YAML object round-trip
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});
