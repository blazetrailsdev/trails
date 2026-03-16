import { describe, it } from "vitest";

describe("ActiveRecord::Encryption::MessageSerializerTest", () => {
  it.skip("serializes messages", () => {});
  it.skip("serializes messages with nested messages in their headers", () => {});
  it.skip("won't load classes from JSON", () => {});
  it.skip("detects random JSON data and raises a decryption error", () => {});
  it.skip("detects random JSON hashes and raises a decryption error", () => {});
  it.skip("detects JSON hashes with a 'p' key that is not encoded in base64", () => {});
  it.skip("raises a TypeError when trying to deserialize other data types", () => {});
  it.skip("raises ForbiddenClass when trying to serialize other data types", () => {});
  it.skip("raises Decryption when trying to parse message with more than one nested message", () => {});
});
