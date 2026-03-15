import { describe, expect, it } from "vitest";

describe("AttributeAliasingTest", () => {
  it("attribute alias", () => {
    class Person {
      private _name = "";
      get name() {
        return this._name;
      }
      set name(v: string) {
        this._name = v;
      }
      get alias_name() {
        return this._name;
      }
      set alias_name(v: string) {
        this._name = v;
      }
    }
    const p = new Person();
    p.name = "david";
    expect(p.alias_name).toBe("david");
    p.alias_name = "alice";
    expect(p.name).toBe("alice");
  });

  it("aliasing to uppercase attributes", () => {
    class Config {
      private _URL = "";
      get URL() {
        return this._URL;
      }
      set URL(v: string) {
        this._URL = v;
      }
      get url() {
        return this._URL;
      }
      set url(v: string) {
        this._URL = v;
      }
    }
    const c = new Config();
    c.URL = "https://example.com";
    expect(c.url).toBe("https://example.com");
  });
});
