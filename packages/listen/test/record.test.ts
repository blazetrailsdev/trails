import { Dir, File, FileUtils, getFs } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Record } from "../lib/record.js";
import { SymlinkDetector } from "../lib/record/symlink-detector.js";
import { Silencer } from "../lib/silencer.js";

describe("Listen::Record", () => {
  const silencer = () => new Silencer({ ignoreBang: [/^\.ignored/] });
  let record: Record;

  const recordTree = (record: Record) =>
    Object.fromEntries((record as unknown as { _tree: Map<string, unknown> })._tree);

  beforeEach(() => {
    record = new Record("/dir", silencer());
  });

  describe("#update_file", () => {
    describe("with path in watched dir", () => {
      it("sets path by spliting dirname and basename", () => {
        record.updateFile("file.rb", { mtime: 1.1 });
        expect(recordTree(record)).toEqual({ "file.rb": { mtime: 1.1 } });
      });

      it("sets path and keeps old data not overwritten", () => {
        record.updateFile("file.rb", { foo: 1, bar: 2 });
        record.updateFile("file.rb", { foo: 3 });
        const watchedDir = recordTree(record);
        expect(watchedDir).toEqual({ "file.rb": { foo: 3, bar: 2 } });
      });
    });

    describe("with subdir path", () => {
      it("sets path by splitting dirname and basename", () => {
        record.updateFile("path/file.rb", { mtime: 1.1 });
        expect(recordTree(record)["path"]).toEqual({ "file.rb": { mtime: 1.1 } });
      });

      it("sets path and keeps old data not overwritten", () => {
        record.updateFile("path/file.rb", { foo: 1, bar: 2 });
        record.updateFile("path/file.rb", { foo: 3 });
        const fileData = (recordTree(record)["path"] as { [k: string]: unknown })["file.rb"];
        expect(fileData).toEqual({ foo: 3, bar: 2 });
      });
    });
  });

  describe("#add_dir", () => {
    it("sets itself when .", () => {
      record.addDir(".");
      expect(recordTree(record)).toEqual({});
    });

    it("sets itself when nil", () => {
      record.addDir(null);
      expect(recordTree(record)).toEqual({});
    });

    it("sets itself when empty", () => {
      record.addDir("");
      expect(recordTree(record)).toEqual({});
    });

    it("correctly sets new directory data", () => {
      record.addDir("path/subdir");
      expect(recordTree(record)).toEqual({ "path/subdir": {} });
    });

    it("sets path and keeps old data not overwritten", () => {
      record.addDir("path/subdir");
      record.updateFile("path/subdir/file.rb", { mtime: 1.1 });
      record.addDir("path/subdir");
      record.updateFile("path/subdir/file2.rb", { mtime: 1.2 });
      record.addDir("path/subdir");

      const watched = recordTree(record);
      expect(Object.keys(watched)).toEqual(["path/subdir"]);
      const subdir = watched["path/subdir"] as { [k: string]: unknown };
      expect(Object.keys(subdir)).toEqual(["file.rb", "file2.rb"]);

      expect(subdir["file.rb"]).toEqual({ mtime: 1.1 });
      expect(subdir["file2.rb"]).toEqual({ mtime: 1.2 });
    });
  });

  describe("#unset_path", () => {
    describe("within watched dir", () => {
      describe("when path is present", () => {
        beforeEach(() => record.updateFile("file.rb", { mtime: 1.1 }));

        it("unsets path", () => {
          record.unsetPath("file.rb");
          expect(recordTree(record)).toEqual({});
        });
      });

      describe("when path not present", () => {
        it("unsets path", () => {
          record.unsetPath("file.rb");
          expect(recordTree(record)).toEqual({});
        });
      });
    });

    describe("within subdir", () => {
      describe("when path is present", () => {
        beforeEach(() => record.updateFile("path/file.rb", { mtime: 1.1 }));

        it("unsets path", () => {
          record.unsetPath("path/file.rb");
          expect(recordTree(record)).toEqual({ path: {} });
        });
      });

      describe("when path not present", () => {
        it("unsets path", () => {
          record.unsetPath("path/file.rb");
          expect(recordTree(record)).toEqual({});
        });
      });
    });
  });

  describe("#file_data", () => {
    describe("with path in watched dir", () => {
      describe("when path is present", () => {
        beforeEach(() => record.updateFile("file.rb", { mtime: 1.1 }));

        it("returns file data", () => {
          expect(record.fileData("file.rb")).toEqual({ mtime: 1.1 });
        });
      });

      describe("path not present", () => {
        it("return empty hash", () => {
          expect(record.fileData("file.rb")).toEqual({});
        });
      });
    });

    describe("with path in subdir", () => {
      describe("when path is present", () => {
        beforeEach(() => record.updateFile("path/file.rb", { mtime: 1.1 }));

        it("returns file data", () => {
          const expected = { mtime: 1.1 };
          expect(record.fileData("path/file.rb")).toEqual(expected);
        });
      });

      describe("path not present", () => {
        it("return empty hash", () => {
          expect(record.fileData("path/file.rb")).toEqual({});
        });
      });
    });
  });

  describe("#dir_entries", () => {
    describe("in watched dir", () => {
      const subject = () => record.dirEntries(".");

      describe("with no entries", () => {
        it("should be empty", () => {
          expect(subject()).toEqual({});
        });
      });

      describe("with file.rb in record", () => {
        beforeEach(() => record.updateFile("file.rb", { mtime: 1.1 }));
        it("should eq", () => {
          expect(subject()).toEqual({ "file.rb": { mtime: 1.1 } });
        });
      });

      describe("with subdir/file.rb in record", () => {
        beforeEach(() => record.updateFile("subdir/file.rb", { mtime: 1.1 }));
        it("should eq", () => {
          expect(subject()).toEqual({ subdir: {} });
        });
      });
    });

    describe("when there is a file with the same name as a dir", () => {
      beforeEach(() => {
        record.updateFile("cypress.json", { mtime: 1.1 });
        record.updateFile("cypress/README.md", { mtime: 1.2 });
        record.updateFile("a/b/cypress/d", { mtime: 1.3 });
        record.updateFile("a/b/c/cypress", { mtime: 1.3 });
      });
      it("should eq", () => {
        expect(record.dirEntries("cypress")).toEqual({ "README.md": { mtime: 1.2 } });
      });
    });

    describe("when there is a file with a similar name to a dir", () => {
      beforeEach(() => {
        record.updateFile("appspec.yml", { mtime: 1.1 });
        record.updateFile("app/README.md", { mtime: 1.2 });
        record.updateFile("spec/app/foo", { mtime: 1.3 });
      });
      it("should eq", () => {
        expect(record.dirEntries("app")).toEqual({ "README.md": { mtime: 1.2 } });
      });
    });

    describe("in subdir /path", () => {
      const subject = () => record.dirEntries("path");

      describe("with no entries", () => {
        it("should be empty", () => {
          expect(subject()).toEqual({});
        });
      });

      describe("with path/file.rb already in record", () => {
        beforeEach(() => record.updateFile("path/file.rb", { mtime: 1.1 }));
        it("should eq", () => {
          expect(subject()).toEqual({ "file.rb": { mtime: 1.1 } });
        });
      });

      describe("with empty path/subdir", () => {
        beforeEach(() => record.addDir("path/subdir"));
        it("should be empty", () => {
          expect(subject()).toEqual({});
        });
      });

      describe("with path/subdir with file", () => {
        beforeEach(() => {
          record.addDir("path/subdir");
          record.updateFile("path/subdir/file.rb", { mtime: 1.1 });
        });
        it("should be empty", () => {
          expect(subject()).toEqual({});
        });
      });

      describe("with path renamed to file", () => {
        beforeEach(() => {
          record.addDir("path/subdir");
          record.updateFile("path", { mtime: 1.1 });
        });
        it("should be empty", () => {
          expect(subject()).toEqual({});
        });
      });
    });
  });

  describe("#build", () => {
    let tmp: string;

    const mkdir = (rel: string) => FileUtils.mkdirP(File.join(tmp, rel));
    const touch = (rel: string) => File.write(File.join(tmp, rel), "x");

    beforeEach(() => {
      tmp = File.realpath(Dir.mktmpdir("listen"));
      record = new Record(tmp, silencer());
    });

    afterEach(() => {
      vi.restoreAllMocks();
      FileUtils.rmRf(tmp);
    });

    it("re-inits paths", async () => {
      record.updateFile("path/file.rb", { mtime: 1.1 });
      await record.build();
      expect(recordTree(record)).toEqual({});
      expect(record.fileData("path/file.rb")).toEqual({});
    });

    describe("with no subdirs", () => {
      beforeEach(() => {
        touch("foo");
        touch("bar");
      });

      it("builds record", async () => {
        await record.build();
        const stat = (rel: string) => {
          const lstat = getFs().lstatSync(File.join(tmp, rel));
          return { mtime: lstat.mtime.getTime() / 1000, mode: lstat.mode, size: lstat.size };
        };
        expect(recordTree(record)).toEqual({ foo: stat("foo"), bar: stat("bar") });
      });
    });

    describe("with subdir containing files", () => {
      beforeEach(() => {
        mkdir("dir1/foo");
        mkdir("dir2");
        mkdir(".ignored");
        touch(".ignored/FETCH_HEAD");
        touch("dir1/foo/bar");
      });

      it("builds record, skipping silenced patterns", async () => {
        await record.build();
        const tree = recordTree(record);
        expect(Object.keys(tree).sort()).toEqual(["dir1", "dir1/foo", "dir2"]);
        expect(tree["dir1"]).toEqual({});
        expect(Object.keys(tree["dir1/foo"] as object)).toEqual(["bar"]);
        expect(tree["dir2"]).toEqual({});
      });
    });

    describe("with subdir containing dirs", () => {
      beforeEach(() => {
        mkdir(".ignored/ignored_file");
        mkdir("dir1/foo/bar");
        mkdir("dir1/foo/baz");
        mkdir("dir2");
      });

      it("builds record", async () => {
        await record.build();
        expect(recordTree(record)).toEqual({
          dir1: {},
          "dir1/foo": {},
          "dir1/foo/bar": {},
          "dir1/foo/baz": {},
          dir2: {},
        });
      });
    });

    describe("with subdir containing symlink to parent", () => {
      beforeEach(() => {
        mkdir("dir1");
        mkdir("dir2");
        getFs().symlinkSync!(File.join(tmp, "dir1"), File.join(tmp, "dir1/foo"));
      });

      it("shows a warning", async () => {
        const warn = vi.spyOn(SymlinkDetector.prototype, "warn").mockImplementation(() => {});

        await record.build();
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/directory is already being watched/),
        );
      });
    });
  });
});
