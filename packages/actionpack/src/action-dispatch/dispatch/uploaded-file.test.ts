import { StringIO, Tempfile } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { UploadedFile } from "../http/upload.js";

describe("UploadedFileTest", () => {
  it("constructor with argument error", () => {
    expect(() => new UploadedFile({})).toThrow(":tempfile is required");
  });

  it("original filename", () => {
    const uf = new UploadedFile({ filename: "foo", tempfile: Tempfile.new() });
    expect(uf.originalFilename).toBe("foo");
  });

  it("filename is different object", () => {
    const fileStr = "foo";
    const uf = new UploadedFile({ filename: fileStr, tempfile: Tempfile.new() });
    expect(uf.originalFilename).toBe("foo");
  });

  it("filename should be in utf 8", () => {
    const uf = new UploadedFile({ filename: "foo", tempfile: Tempfile.new() });
    expect(uf.originalFilename).toBe("foo");
  });

  it("filename should always be in utf 8", () => {
    const uf = new UploadedFile({ filename: "日本語", tempfile: Tempfile.new() });
    expect(uf.originalFilename).toBe("日本語");
  });

  it("content type", () => {
    const uf = new UploadedFile({ type: "foo", tempfile: Tempfile.new() });
    expect(uf.contentType).toBe("foo");
  });

  it("headers", () => {
    const uf = new UploadedFile({ head: "foo", tempfile: Tempfile.new() });
    expect(uf.headers).toBe("foo");
  });

  it("headers should be in utf 8", () => {
    const uf = new UploadedFile({ filename: "foo", head: "foo", tempfile: Tempfile.new() });
    expect(uf.headers).toBe("foo");
  });

  it("headers should always be in utf 8", () => {
    const uf = new UploadedFile({ filename: "foo", head: "café", tempfile: Tempfile.new() });
    expect(uf.headers).toBe("café");
  });

  it("tempfile", () => {
    const tf = Tempfile.new();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.tempfile).toBe(tf);
  });

  it("to io returns file", () => {
    const tf = Tempfile.new();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.toIo()).toBe(tf.toIo());
  });

  it("delegates path to tempfile", () => {
    const tf = Tempfile.new();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.path()).toBe(tf.path());
  });

  it("delegates open to tempfile", () => {
    const tf = Tempfile.new();
    tf.close();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.open()).toBe(tf.toIo());
    expect(tf.isClosed()).toBe(false);
  });

  it("delegates close to tempfile", () => {
    const tf = Tempfile.new();
    const uf = new UploadedFile({ tempfile: tf });
    uf.close();
    expect(tf.isClosed()).toBe(true);
  });

  it("close accepts parameter", () => {
    const tf = Tempfile.new();
    const uf = new UploadedFile({ tempfile: tf });
    uf.close(true);
    expect(tf.isClosed()).toBe(true);
    expect(tf.path()).toBeNull();
  });

  it("delegates read to tempfile", () => {
    const tf = Tempfile.new();
    tf.write("thunderhorse");
    tf.rewind();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.read()).toBe("thunderhorse");
  });

  it("delegates read to tempfile with params", () => {
    const tf = Tempfile.new();
    tf.write("thunderhorse");
    tf.rewind();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.read(7)).toBe("thunder");
    expect(uf.read(5, new Uint8Array(5))).toBe("horse");
  });

  it("delegate eof to tempfile", () => {
    const tf = Tempfile.new();
    tf.write("thunderhorse");
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.isEof()).toBe(true);
    tf.rewind();
    expect(uf.isEof()).toBe(false);
  });

  it("delegate to path to tempfile", () => {
    const tf = Tempfile.new();
    const uf = new UploadedFile({ tempfile: tf });
    expect(uf.toPath()).toBe(tf.toPath());
  });

  it("io copy stream", () => {
    const tf = Tempfile.new();
    tf.write("thunderhorse");
    tf.rewind();
    const uf = new UploadedFile({ tempfile: tf });
    const result = new StringIO();
    result.write(uf.read());
    expect(result.string()).toBe("thunderhorse");
  });
});
