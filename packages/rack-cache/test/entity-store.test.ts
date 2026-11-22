import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, getFs, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Disk, EntityStore, Heap, Noop } from "../lib/entity-store.js";
import { createTempDirectory, removeEntrySecure } from "./support/test-helper.js";

function assertShaLike(object: string | null | undefined): void {
  expect(object).toBeTruthy();
  expect(object!.length).toBe(40);
  expect(object).toMatch(/^[0-9a-z]+$/);
}

function text(data: string | Uint8Array | null): string | null {
  return data instanceof Uint8Array ? new TextDecoder().decode(data) : data;
}

export function rackCacheEntityStoreImplementation(store: () => Heap | Disk): void {
  it("responds to all required messages", () => {
    for (const message of ["read", "open", "write", "isExist"]) {
      expect(rbObjRespondTo(store(), message)).toBeTruthy();
    }
  });

  it("stores bodies with #write", async () => {
    const [key] = await store().write(["My wild love went riding,"]);
    assertShaLike(key);

    const data = await store().read(key);
    expect(text(data as string)).toBe("My wild love went riding,");
  });

  it("takes a ttl parameter for #write", async () => {
    const [key] = await store().write(["My wild love went riding,"], 0);
    assertShaLike(key);

    const data = await store().read(key);
    expect(text(data as string)).toBe("My wild love went riding,");
  });

  it("correctly determines whether cached body exists for key with #exist?", async () => {
    const [key] = await store().write(["She rode to the devil,"]);
    expect(await store().isExist(key)).toBeTruthy();
    expect(await store().isExist("938jasddj83jasdh4438021ksdfjsdfjsdsf")).toBeFalsy();
  });

  it("can read data written with #write", async () => {
    const [key] = await store().write(["And asked him to pay."]);
    const data = await store().read(key);
    expect(text(data as string)).toBe("And asked him to pay.");
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
    expect(text(await store().read(key))).toBe("She gathered together");
  });

  it("returns nil from #read when key does not exist", async () => {
    expect(await store().read("87fe0a1ae82a518592f6b12b0183e950b4541c62")).toBeNull();
  });

  it("returns a Rack compatible body from #open", async () => {
    const [key] = await store().write(["Some shells for her hair."]);
    const body = (await store().open(key))!;
    expect(rbObjRespondTo(body, "each")).toBeTruthy();
    let buf = "";
    for await (const part of body instanceof File ? body.eachAsync() : body) buf += text(part);
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

  describe("Disk", () => {
    let tempDir: string;
    let store: Disk;
    beforeEach(async () => {
      tempDir = await createTempDirectory();
      store = await EntityStore.Disk.new(tempDir);
    });

    afterEach(async () => {
      await removeEntrySecure(tempDir);
    });
    rackCacheEntityStoreImplementation(() => store);

    it("takes a path to ::new and creates the directory", async () => {
      const path = tempDir + "/foo";
      store = await EntityStore.Disk.new(path);
      expect(await File.isDirectoryAsync(path)).toBeTruthy();
    });

    it("produces a body that responds to #to_path", async () => {
      const [key] = await store.write(["Some shells for her hair."]);
      const body = (await store.open(key))!;
      expect(rbObjRespondTo(body, "toPath")).toBeTruthy();
      const path = `${tempDir}/${key.slice(0, 2)}/${key.slice(2)}`;
      expect(body.toPath()).toBe(path);
      body.close();
    });

    it("spreads data over a 36² hash radius", async () => {
      for (const line of PROSE.split(/(?<=\n)/)) {
        assertShaLike((await store.write([line]))[0]);
      }
      const subdirs = await Dir.globAsync(`${tempDir}/*`);
      for (const subdir of subdirs) {
        expect(File.basename(subdir)).toMatch(/^[0-9a-z]{2}$/);
        const files = await Dir.globAsync(`${subdir}/*`);
        for (const filename of files) {
          expect(File.basename(filename)).toMatch(/^[0-9a-z]{38}$/);
        }
        expect(files.length).toBeGreaterThan(0);
      }
      expect(subdirs.length).toBe(28);
    });
  });
});

const PROSE = `        My wild love went riding,
        She rode all the day;
        She rode to the devil,
        And asked him to pay.

        The devil was wiser
        It's time to repent;
        He asked her to give back
        The money she spent

        My wild love went riding,
        She rode to sea;
        She gathered together
        Some shells for her hair

        She rode on to Christmas,
        She rode to the farm;
        She rode to Japan
        And re-entered a town

        My wild love is crazy
        She screams like a bird;
        She moans like a cat
        When she wants to be heard

        She rode and she rode on
        She rode for a while,
        Then stopped for an evening
        And laid her head down

        By this time the weather
        Had changed one degree,
        She asked for the people
        To let her go free

        My wild love went riding,
        She rode for an hour;
        She rode and she rested,
        And then she rode on
        My wild love went riding,
`;
