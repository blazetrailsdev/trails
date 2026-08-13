import { describe, it, expect } from "vitest";
import { Document, Element, ParseException, RuntimeError, Text } from "./document.js";

// REXML is Ruby stdlib, so there is no Rails test file to mirror: these cover
// the slice of the parser `XmlMini_REXML` drives.
describe("REXML::Document", () => {
  it("exposes the root element", () => {
    const doc = new Document("<?xml version='1.0'?><root/>");
    expect(doc.root?.name).toBe("root");
    expect(doc.root?.hasElements()).toBe(false);
  });

  it("has no root for an XML declaration only", () => {
    expect(new Document("<?xml version='1.0'?>").root).toBeUndefined();
  });

  it("reads attributes and unescapes entities", () => {
    const doc = new Document(`<root a="1" b='&lt;&amp;&#65;'/>`);
    const attrs: Array<[string, string]> = [];
    doc.root!.attributes.each((n, v) => attrs.push([n, v]));
    expect(attrs).toEqual([
      ["a", "1"],
      ["b", "<&A"],
    ]);
  });

  it("nests child elements and text", () => {
    const doc = new Document("<products><book>Ruby</book><!-- c --><book/></products>");
    const root = doc.root!;
    expect(root.hasElements()).toBe(true);
    const names: string[] = [];
    root.eachElement((child) => names.push(child.name));
    expect(names).toEqual(["book", "book"]);
    const book = root.children[0] as Element;
    expect(book.hasText()).toBe(true);
    expect(book.texts.map((t: Text) => t.value)).toEqual(["Ruby"]);
  });

  it("reads CDATA as text", () => {
    const doc = new Document("<root><![CDATA[<b>hi</b>]]></root>");
    expect(doc.root!.texts.map((t) => t.value)).toEqual(["<b>hi</b>"]);
  });

  it("expands the internal DTD subset entities", () => {
    const doc = new Document(`<!DOCTYPE root [<!ENTITY a "aaa">]><root>&a;</root>`);
    expect(doc.root!.texts.map((t) => t.value)).toEqual(["aaa"]);
  });

  it("raises RuntimeError when an entity expands past REXML's text limit", () => {
    const doc = new Document(`<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE member [
        <!ENTITY a "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
        <!ENTITY b "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
        <!ENTITY c "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;">
        <!ENTITY d "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;">
        <!ENTITY e "&f;&f;&f;&f;&f;&f;&f;&f;&f;&f;">
        <!ENTITY f "&g;&g;&g;&g;&g;&g;&g;&g;&g;&g;">
        <!ENTITY g "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
      ]>
      <member>&a;</member>`);
    // REXML expands lazily: the document parses, #value raises.
    expect(() => doc.root!.texts.map((t) => t.value)).toThrow(RuntimeError);
  });

  it("raises ParseException on an unclosed tag", () => {
    expect(() => new Document("<root><a></root>")).toThrow(ParseException);
  });

  it("serializes back to XML", () => {
    expect(new Document(`<root a="1"><b>x</b></root>`).toString()).toBe(
      "<root a='1'><b>x</b></root>",
    );
  });
});
