import { describe, it, expect } from "vitest";
import { tokenize as erbTokenize } from "./tse/util.js";

function tokenize(source: string): [string, string][] {
  return erbTokenize(source);
}

describe("TSEUtilTest", () => {
  it("template output", () => {
    const source = "Posts: <%= @post.length %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":TEXT", "Posts: "],
      [":OPEN", "<%="],
      [":CODE", " @post.length "],
      [":CLOSE", "%>"],
    ]);
  });

  it("multi tag", () => {
    const source = "Posts: <%= @post.length %> <% puts 'hi' %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":TEXT", "Posts: "],
      [":OPEN", "<%="],
      [":CODE", " @post.length "],
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
    ]);
  });

  it("multi line", () => {
    const source = "Posts: <%= @post.length %> <% puts 'hi' %>\nfoo <%";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":TEXT", "Posts: "],
      [":OPEN", "<%="],
      [":CODE", " @post.length "],
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
      [":TEXT", "\nfoo "],
      [":OPEN", "<%"],
    ]);
  });

  it("starts with newline", () => {
    const source = "\nPosts: <%= @post.length %> <% puts 'hi' %>\nfoo <%";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":TEXT", "\nPosts: "],
      [":OPEN", "<%="],
      [":CODE", " @post.length "],
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
      [":TEXT", "\nfoo "],
      [":OPEN", "<%"],
    ]);
  });

  it("newline inside tag", () => {
    const source = "Posts: <%= \n @post.length %> <% puts 'hi' %>\nfoo <%";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":TEXT", "Posts: "],
      [":OPEN", "<%="],
      [":CODE", " \n @post.length "],
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
      [":TEXT", "\nfoo "],
      [":OPEN", "<%"],
    ]);
  });

  it("start", () => {
    const source = "<%= @post.length %> <% puts 'hi' %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":OPEN", "<%="],
      [":CODE", " @post.length "],
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
    ]);
  });

  it("mid", () => {
    const source = "@post.length %> <% puts 'hi' %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":CODE", "@post.length "],
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
    ]);
  });

  it("mid start", () => {
    const source = "%> <% puts 'hi' %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi' "],
      [":CLOSE", "%>"],
    ]);
  });

  it("no end", () => {
    let source = "%> <% puts 'hi'";
    let actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":CLOSE", "%>"],
      [":TEXT", " "],
      [":OPEN", "<%"],
      [":CODE", " puts 'hi'"],
    ]);

    source = "<% puts 'hi'";
    actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":OPEN", "<%"],
      [":CODE", " puts 'hi'"],
    ]);
  });

  it("text end", () => {
    const source = "<%= @post.title %>   ";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":OPEN", "<%="],
      [":CODE", " @post.title "],
      [":CLOSE", "%>"],
      [":TEXT", "   "],
    ]);
  });

  it("multibyte characters start", () => {
    const source = "こんにちは<%= name %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":TEXT", "こんにちは"],
      [":OPEN", "<%="],
      [":CODE", " name "],
      [":CLOSE", "%>"],
    ]);
  });

  it("multibyte characters end", () => {
    const source = " 'こんにちは' %>";
    const actualTokens = tokenize(source);
    expect(actualTokens).toEqual([
      [":CODE", " 'こんにちは' "],
      [":CLOSE", "%>"],
    ]);
  });
});
