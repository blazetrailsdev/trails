import { describe, expect, it } from "vitest";
import { Field, FieldList } from "./index.js";

const received = (host: string) =>
  `Received: from ${host} by xxx.xxxx.xxx with ESMTP id 6AAEE3B4D23 for <xxx@xxxx.xxx>; Sun, 8 May 2005 12:30:23 -0500`;

describe("Mail::FieldList", () => {
  it("should be able to add new fields", () => {
    const fl = new FieldList();
    fl.addField(Field.parse("To: mikel@me.com")!);
    fl.addField(Field.parse("From: mikel@me.com")!);
    expect(fl.map((f) => f.name)).toEqual(["From", "To"]);
  });

  it("should be able to add new fields in the right order", () => {
    const fl = new FieldList();
    fl.addField(Field.parse("To: mikel@me.com")!);
    fl.addField(Field.parse("From: mikel@me.com")!);
    fl.addField(Field.parse(received("xxx.xxxx.xxx"))!);
    fl.addField(Field.parse("Return-Path: mikel@me.com")!);
    expect(fl.map((f) => f.name)).toEqual(["Return-Path", "Received", "From", "To"]);
  });

  it("should add new Received items after the existing ones", () => {
    const fl = new FieldList();
    fl.addField(Field.parse("To: mikel@me.com")!);
    fl.addField(Field.parse("From: mikel@me.com")!);
    fl.addField(Field.parse(received("xxx.xxxx.xxx"))!);
    fl.addField(Field.parse("Return-Path: mikel@me.com")!);
    fl.addField(Field.parse(received("123.xxxx.xxx"))!);
    expect(fl[2].field.value).toEqual(received("123.xxxx.xxx").slice("Received: ".length));
  });
});
