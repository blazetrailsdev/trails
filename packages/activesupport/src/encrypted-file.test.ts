import { describe, it } from "vitest";

describe("EncryptedFileTest", () => {
  it.skip("reading content by env key", () => {});
  it.skip("reading content by key file", () => {});
  it.skip("change content by key file", () => {});
  it.skip("change sets restricted permissions", () => {});
  it.skip("raise MissingKeyError when key is missing", () => {});
  it.skip("raise MissingKeyError when env key is blank", () => {});
  it.skip("key can be added after MissingKeyError raised", () => {});
  it.skip("key? is true when key file exists", () => {});
  it.skip("key? is true when env key is present", () => {});
  it.skip("key? is false and does not raise when the key is missing", () => {});
  it.skip("raise InvalidKeyLengthError when key is too short", () => {});
  it.skip("raise InvalidKeyLengthError when key is too long", () => {});
  it.skip("respects existing content_path symlink", () => {});
  it.skip("creates new content_path symlink if it's dead", () => {});
  it.skip("can read encrypted file after changing default_serializer", () => {});
});
