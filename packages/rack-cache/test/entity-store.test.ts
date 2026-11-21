import { describe, it, expect, beforeEach } from "vitest";
import { getFs, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Heap, Noop } from "../lib/entity-store.js";

function assertShaLike(object: string | null | undefined): void {
  expect(object).toBeTruthy();
  expect(object!.length).toBe(40);
  expect(object).toMatch(/^[0-9a-z]+$/);
}

export function rackCacheEntityStoreImplementation(store: () => Heap): void {
  it("responds to all required messages", () => {
    for (const message of ["read", "open", "write", "isExist"]) {
      expect(rbObjRespondTo(store(), message)).toBeTruthy();
    }
  });

  it("stores bodies with #write", async () => {
    const [key] = await store().write(["My wild love went riding,"]);
    assertShaLike(key);

    const data = await store().read(key);
    expect(data).toBe("My wild love went riding,");
  });

  it("takes a ttl parameter for #write", async () => {
    const [key] = await store().write(["My wild love went riding,"], 0);
    assertShaLike(key);

    const data = await store().read(key);
    expect(data).toBe("My wild love went riding,");
  });

  it("correctly determines whether cached body exists for key with #exist?", async () => {
    const [key] = await store().write(["She rode to the devil,"]);
    expect(await store().isExist(key)).toBeTruthy();
    expect(await store().isExist("938jasddj83jasdh4438021ksdfjsdfjsdsf")).toBeFalsy();
  });

  it("can read data written with #write", async () => {
    const [key] = await store().write(["And asked him to pay."]);
    const data = await store().read(key);
    expect(data).toBe("And asked him to pay.");
  });

  it("gives a 40 character SHA1 hex digest from #write", async () => {
    const [key] = await store().write(["she rode to the sea;"]);
    expect(key == null).toBeFalsy();
    expect(key.length).toBe(40);
    expect(key).toMatch(/^[0-9a-z]+$/);
    expect(key).toBe("90a4c84d51a277f3dafc34693ca264531b9f51b6");
  });

  it("returns the entire body as a String from #read", async () => {
    const [key] = await store().write(["She gathered together"]);
    expect(await store().read(key)).toBe("She gathered together");
  });

  it("returns nil from #read when key does not exist", async () => {
    expect(await store().read("87fe0a1ae82a518592f6b12b0183e950b4541c62")).toBeNull();
  });

  it("returns a Rack compatible body from #open", async () => {
    const [key] = await store().write(["Some shells for her hair."]);
    const body = (await store().open(key))!;
    expect(Symbol.iterator in body).toBeTruthy();
    let buf = "";
    for (const part of body) buf += part;
    expect(buf).toBe("Some shells for her hair.");
  });

  it("returns nil from #open when key does not exist", async () => {
    expect(await store().open("87fe0a1ae82a518592f6b12b0183e950b4541c62")).toBeNull();
  });

  it("can store largish bodies with binary data", async () => {
    const pony = Uint8Array.from(
      await getFs().readFile(new URL("./pony.jpg", import.meta.url).pathname),
    );
    const [key] = await store().write([pony]);
    expect(key).toBe("d0f30d8659b4d268c5c64385d9790024c2d78deb");
    const data = (await store().read(key))!;
    expect(data.length).toBe(pony.length);
    expect(data).toEqual(pony);
  });

  it("deletes stored entries with #purge", async () => {
    const [key] = await store().write(["My wild love went riding,"]);
    expect(await store().purge(key)).toBeNull();
    expect(await store().read(key)).toBeNull();
  });
}

describe("Rack::Cache::EntityStore", () => {
  describe("Heap", () => {
    let store: Heap;
    beforeEach(() => {
      store = new Heap();
    });

    rackCacheEntityStoreImplementation(() => store);

    it("takes a Hash to ::new", async () => {
      store = new Heap({ foo: ["bar"] });
      expect(await store.read("foo")).toBe("bar");
    });

    it("uses its own Hash with no args to ::new", async () => {
      expect(await store.read("foo")).toBeNull();
    });
  });

  describe("Noop", () => {
    let store: Noop;
    beforeEach(() => {
      store = new Noop();
    });

    it("responds to all required messages", () => {
      for (const message of ["read", "open", "write", "isExist"]) {
        expect(rbObjRespondTo(store, message)).toBeTruthy();
      }
    });

    it("accepts bodies with #write", async () => {
      const [key] = await store.write(["My wild love went riding,"]);
      expect(key == null).toBeFalsy();
      expect(key.length === 40 && /^[0-9a-z]+$/.test(key)).toBeTruthy();
    });

    it("takes a ttl parameter for #write", async () => {
      const [key] = await store.write(["My wild love went riding,"], 0);
      expect(key == null).toBeFalsy();
      expect(key.length === 40 && /^[0-9a-z]+$/.test(key)).toBeTruthy();
    });

    it("always responds to #exist? with true, regardless of the content having been saved before", async () => {
      const [key] = await store.write(["She rode to the devil,"]);
      expect(await store.isExist(key)).toBeTruthy();
      expect(await store.isExist("938jasddj83jasdh4438021ksdfjsdfjsdsf")).toBeTruthy();
    });

    it("always responds to #read with an empty String", async () => {
      const [key] = await store.write(["And asked him to pay."]);
      let data = await store.read(key);
      expect(data).toBe("");
      data = await store.read("938jasddj83jasdh4438021ksdfjsdfjsdsf");
      expect(data).toBe("");
    });

    it("gives a 40 character SHA1 hex digest from #write", async () => {
      const [key] = await store.write(["she rode to the sea;"]);
      expect(key == null).toBeFalsy();
      expect(key.length).toBe(40);
      expect(key).toMatch(/^[0-9a-z]+$/);
      expect(key).toBe("90a4c84d51a277f3dafc34693ca264531b9f51b6");
    });

    it("always responds to #open with empty array", async () => {
      const [key] = await store.write(["And asked him to pay."]);
      let data = await store.open(key);
      expect(data).toEqual([]);
      data = await store.open("938jasddj83jasdh4438021ksdfjsdfjsdsf");
      expect(data).toEqual([]);
    });

    it("returns a Rack compatible body from #open", async () => {
      const [key] = await store.write(["Some shells for her hair."]);
      const body = await store.open(key);
      expect(Symbol.iterator in body).toBeTruthy();
      expect(body).toEqual([]);
    });

    it("responds to #purge and returns nil", async () => {
      const [key] = await store.write(["My wild love went riding,"]);
      expect(await store.purge(key)).toBeNull();
    });
  });
});
