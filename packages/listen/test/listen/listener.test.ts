import { Dir, FileUtils } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    if (listener != null && !listener.isStopped()) await listener.stop();
    FileUtils.rmRf(dir);
  });

  describe("#start", () => {
    it("sets paused to false", async () => {
      await subject().start();
      expect(subject().isPaused()).toBe(false);
    });

    it("starts adapter", async () => {
      await subject().start();
      expect(subject()._subscriptions).toHaveLength(1);
    });
  });

  describe("#stop", () => {
    describe("when fully started", () => {
      it("terminates", async () => {
        await subject().start();
        await subject().stop();
        expect(subject()._subscriptions).toHaveLength(0);
        expect(subject().isStopped()).toBe(true);
      });
    });

    describe("when only initialized", () => {
      it("terminates", async () => {
        await subject().stop();
        expect(subject().isStopped()).toBe(true);
      });
    });
  });

  describe("#pause", () => {
    it("sets paused to true", async () => {
      await subject().start();
      await subject().pause();
      expect(subject().isPaused()).toBe(true);
    });
  });

  describe("unpause with start", () => {
    it("sets paused to false", async () => {
      await subject().start();
      await subject().pause();
      await subject().start();
      expect(subject().isPaused()).toBe(false);
    });
  });

  describe("#paused?", () => {
    it("returns true when paused", async () => {
      await subject().start();
      await subject().pause();
      expect(subject().isPaused()).toBe(true);
    });

    it("returns false when not paused", async () => {
      await subject().start();
      expect(subject().isPaused()).toBe(false);
    });
  });

  describe("#ignore", () => {
    describe("with existing ignore options", () => {
      it("adds up to existing ignore options", () => {
        options = { ignore: /bar/ };
        expect(subject()._prevSilencerOptions).toEqual({ ignore: [/bar/] });
        subject().ignore(/foo/);
        expect(subject()._prevSilencerOptions).toEqual({ ignore: [/bar/, /foo/] });
      });
    });

    describe("with existing ignore options (array)", () => {
      it("adds up to existing ignore options", () => {
        options = { ignore: [/bar/] };
        expect(subject()._prevSilencerOptions).toEqual({ ignore: [/bar/] });
        subject().ignore(/foo/);
        expect(subject()._prevSilencerOptions).toEqual({ ignore: [/bar/, /foo/] });
      });
    });
  });

  describe("#ignore!", () => {
    describe("with no existing options", () => {
      it("sets options", () => {
        expect(subject()._prevSilencerOptions).toEqual(options);
      });
    });

    describe("with existing ignore! options", () => {
      it("overwrites existing ignore options", () => {
        options = { ignoreBang: /bar/ };
        expect(subject()._prevSilencerOptions).toEqual({ ignoreBang: [/bar/] });
        subject().ignoreBang([/foo/]);
        expect(subject()._prevSilencerOptions).toEqual({ ignoreBang: [/foo/] });
      });
    });

    describe("with existing ignore options", () => {
      it("deletes ignore options", () => {
        options = { ignore: /bar/ };
        expect(subject()._prevSilencerOptions).toEqual({ ignore: [/bar/] });
        subject().ignoreBang([/foo/]);
        expect(subject()._prevSilencerOptions).toEqual({ ignoreBang: [/foo/] });
      });
    });
  });

  describe("#only", () => {
    describe("with existing only options", () => {
      it("overwrites existing ignore options", () => {
        options = { only: /bar/ };
        expect(subject()._prevSilencerOptions).toEqual({ only: [/bar/] });
        subject().only([/foo/]);
        expect(subject()._prevSilencerOptions).toEqual({ only: [/foo/] });
      });
    });
  });
});
