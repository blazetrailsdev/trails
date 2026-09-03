import { describe, it, expect } from "vitest";
import { sendPreloadLinksHeader } from "./asset-tag-helper.js";

const responseDouble = (isSending: boolean, link?: string) => {
  const headers = new Map<string, string>(link === undefined ? [] : [["link", link]]);
  return {
    isSending,
    headers: {
      get: (key: string) => headers.get(key),
      set: (key: string, value: string) => void headers.set(key, value),
    },
  };
};

describe("sendPreloadLinksHeader", () => {
  it("appends to the response's existing link header", () => {
    const response = responseDouble(false, "<a.css>; rel=preload; as=style");

    sendPreloadLinksHeader.call({ response }, ["<b.css>; rel=preload; as=style"]);

    expect(response.headers.get("link")).toBe(
      "<a.css>; rel=preload; as=style,<b.css>; rel=preload; as=style",
    );
  });

  it("returns early once the response is sending", () => {
    const response = responseDouble(true);

    sendPreloadLinksHeader.call({ response }, ["<b.css>; rel=preload; as=style"]);

    expect(response.headers.get("link")).toBeUndefined();
  });
});
