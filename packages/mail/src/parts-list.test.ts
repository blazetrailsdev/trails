import { describe, expect, it } from "vitest";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import "./index.js";
import { Part } from "./part.js";
import { PartsList } from "./parts-list.js";

describe("PartsList", () => {
  it("should return itself on sort", () => {
    const p = new PartsList();
    p.push(2 as never);
    p.push(1 as never);
    expect(p.sort().constructor).toBe(PartsList);
  });

  it("should not fail if we do not have a content_type", () => {
    const p = new PartsList();
    const order = ["text/plain"];
    p.push("text/plain" as never);
    p.push("text/html" as never);
    p.sortBang(order);
  });

  it("should not fail if we do not have a content_type", () => {
    const p = new PartsList();
    const order = ["text/plain", "text/html"];

    const noContentTypePart = new Part();
    const plainTextPart = new Part();
    const htmlTextPart = new Part();

    noContentTypePart.setContentType(null);
    htmlTextPart.setContentType("text/html");

    p.push(noContentTypePart);
    p.push(plainTextPart);
    p.push(htmlTextPart);
    expect(p.sortBang(order)).toEqual([plainTextPart, htmlTextPart, noContentTypePart]);
  });

  it("should not fail on empty PartsList", () => {
    const p = new PartsList();
    const order = ["text/plain"];
    p.sortBang(order);
  });

  it("should sort attachments to end", () => {
    const p = new PartsList();
    const order = ["text/plain", "text/html"];

    const attachmentPart = new Part();
    const htmlTextPart = new Part();
    const plainTextPart = new Part();

    attachmentPart.setContentType('text/plain; filename="foo.txt"');
    attachmentPart.setContentDisposition('attachment; filename="foo.txt"');

    htmlTextPart.setContentType("text/html");

    p.push(attachmentPart);
    p.push(htmlTextPart);
    p.push(plainTextPart);
    expect(p.sortBang(order)).toEqual([plainTextPart, htmlTextPart, attachmentPart]);
  });

  it("should have a parts reader", () => {
    const p = new PartsList([1, 2]);
    expect(p.parts).toEqual([1, 2]);
  });

  it("should behave like an array", () => {
    const p = new PartsList([1, 2]);
    expect(p[0]).toEqual(1);
  });

  it("is equal to itself", () => {
    const p = new PartsList([1, 2]);
    expect(p).toBe(p);
  });

  it("is equal to its parts array", () => {
    const p = new PartsList();
    p.push("foo" as never);
    p.push("bar" as never);
    expect(Array.from(p)).toEqual(["foo", "bar"]);
  });

  it("can be mixed with an array", () => {
    const p = new PartsList([3, 4]);
    expect([1, 2, ...p]).toEqual([1, 2, 3, 4]);
  });

  it("should respond to Array methods", () => {
    const p = new PartsList();
    expect(p).toRespondTo("reduce");
  });

  it("should have a round-tripping YAML serialization", () => {
    const p = new PartsList([1, 2]);
    expect(YAML.load(p.toYaml())).toEqual(Array.from(p));
  });
});
