import { block, Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Listener, type ListenerOptions } from "../../lib/listen.js";

describe("Listener", () => {
  let dir: string;
  let options: ListenerOptions;
  let listener: Listener | null;

  const subject = (): Listener => (listener ??= new Listener(dir, options));

  beforeEach(() => {
    dir = Dir.mktmpdir();
    options = {};
    listener = null;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (listener != null && !listener.isStopped()) await listener.stop();
    FileUtils.rmRf(dir);
  });

  describe("initialize", () => {
    describe("with a block", () => {
      it("passes the block to the event processor", async () => {
        const myblock = vi.fn();
        listener = new Listener(
          dir,
          block((...args: string[][]) => myblock(...args)),
        );
        expect(listener._block).toBeTruthy();
        await listener._block!([], [], []);
        expect(myblock).toHaveBeenCalled();
      });
    });

    describe("with directories", () => {
      it("passes directories to backend", async () => {
        const dir2 = Dir.mktmpdir();
        try {
          const realpath = vi.spyOn(File, "realpathAsync");
          listener = new Listener(dir, dir2);
          await listener.start();
          expect(realpath.mock.calls.map((c) => c[0])).toEqual([dir, dir2]);
        } finally {
          await listener?.stop();
          FileUtils.rmRf(dir2);
        }
      });
    });
  });

  describe("#start", () => {
    it("sets paused to false", async () => {
      await subject().start();
      expect(subject().isPaused()).toBeFalsy();
    });

    it("starts adapter", async () => {
      const startBackend = vi.spyOn(subject(), "_startBackend");
      await subject().start();
      expect(startBackend).toHaveBeenCalled();
    });
  });

  describe("#stop", () => {
    describe("when fully started", () => {
      it("terminates", async () => {
        await subject().start();
        await subject().stop();
      });
    });

    describe("when only initialized", () => {
      it("terminates", async () => {
        subject();
        await subject().stop();
      });
    });
  });

  describe("#pause", () => {
    it("sets paused to true", async () => {
      await subject().start();
      await subject().pause();
      expect(subject().isPaused()).toBeTruthy();
    });
  });

  describe("unpause with start", () => {
    it("sets paused to false", async () => {
      await subject().start();
      await subject().pause();
      await subject().start();
      expect(subject().isPaused()).toBeFalsy();
    });
  });

  describe("#paused?", () => {
    it("returns true when paused", async () => {
      await subject().start();
      await subject().pause();
      expect(subject().isPaused()).toBeTruthy();
    });

    it("returns false when not paused", async () => {
      await subject().start();
      expect(subject().isPaused()).toBeFalsy();
    });
  });

  const spyConfigure = () => vi.spyOn(Listener.prototype, "_reconfigureSilencer");

  describe("#ignore", () => {
    describe("with existing ignore options", () => {
      it("adds up to existing ignore options", () => {
        options = { ignore: /bar/ };
        const configure = spyConfigure();
        subject();
        expect(configure).toHaveBeenCalledWith({ ignore: /bar/ });
        subject().ignore(/foo/);
        expect(configure).toHaveBeenCalledWith({ ignore: [/bar/, /foo/] });
      });
    });

    describe("with existing ignore options (array)", () => {
      it("adds up to existing ignore options", () => {
        options = { ignore: [/bar/] };
        const configure = spyConfigure();
        subject();
        expect(configure).toHaveBeenCalledWith({ ignore: [/bar/] });
        subject().ignore(/foo/);
        expect(configure).toHaveBeenCalledWith({ ignore: [/bar/, /foo/] });
      });
    });
  });

  describe("#ignore!", () => {
    describe("with no existing options", () => {
      it("sets options", () => {
        const configure = spyConfigure();
        subject();
        expect(configure).toHaveBeenCalledWith(options);
      });
    });

    describe("with existing ignore! options", () => {
      it("overwrites existing ignore options", () => {
        options = { ignoreBang: /bar/ };
        const configure = spyConfigure();
        subject();
        expect(configure).toHaveBeenCalledWith({ ignoreBang: /bar/ });
        subject().ignoreBang([/foo/]);
        expect(configure).toHaveBeenCalledWith({ ignoreBang: [/foo/] });
      });
    });

    describe("with existing ignore options", () => {
      it("deletes ignore options", () => {
        options = { ignore: /bar/ };
        const configure = spyConfigure();
        subject();
        expect(configure).toHaveBeenCalledWith({ ignore: /bar/ });
        subject().ignoreBang([/foo/]);
        expect(configure).toHaveBeenCalledWith({ ignoreBang: [/foo/] });
      });
    });
  });

  describe("#only", () => {
    describe("with existing only options", () => {
      it("overwrites existing ignore options", () => {
        options = { only: /bar/ };
        const configure = spyConfigure();
        subject();
        expect(configure).toHaveBeenCalledWith({ only: /bar/ });
        subject().only([/foo/]);
        expect(configure).toHaveBeenCalledWith({ only: [/foo/] });
      });
    });
  });
});
