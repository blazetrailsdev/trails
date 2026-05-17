import { describe, it, expect } from "vitest";
import { ContentDisposition } from "./content-disposition.js";

describe("ContentDispositionTest", () => {
  it("encoding a Latin filename", () => {
    const disposition = new ContentDisposition({ disposition: "inline", filename: "racecar.jpg" });
    expect(disposition.asciiFilename()).toBe('filename="racecar.jpg"');
    expect(disposition.utf8Filename()).toBe("filename*=UTF-8''racecar.jpg");
    expect(disposition.toString()).toBe(
      `inline; ${disposition.asciiFilename()}; ${disposition.utf8Filename()}`,
    );
  });

  it("encoding a Latin filename with accented characters", () => {
    const disposition = new ContentDisposition({ disposition: "inline", filename: "råcëçâr.jpg" });
    expect(disposition.asciiFilename()).toBe('filename="racecar.jpg"');
    expect(disposition.utf8Filename()).toBe("filename*=UTF-8''r%C3%A5c%C3%AB%C3%A7%C3%A2r.jpg");
    expect(disposition.toString()).toBe(
      `inline; ${disposition.asciiFilename()}; ${disposition.utf8Filename()}`,
    );
  });

  it("encoding a non-Latin filename", () => {
    const disposition = new ContentDisposition({
      disposition: "inline",
      filename: "автомобиль.jpg",
    });
    expect(disposition.asciiFilename()).toBe('filename="%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F.jpg"');
    expect(disposition.utf8Filename()).toBe(
      "filename*=UTF-8''%D0%B0%D0%B2%D1%82%D0%BE%D0%BC%D0%BE%D0%B1%D0%B8%D0%BB%D1%8C.jpg",
    );
    expect(disposition.toString()).toBe(
      `inline; ${disposition.asciiFilename()}; ${disposition.utf8Filename()}`,
    );
  });

  it("encoding a filename with permitted chars", () => {
    const disposition = new ContentDisposition({
      disposition: "inline",
      filename: "argh+!#$-123_|&^`~.jpg",
    });
    expect(disposition.asciiFilename()).toBe('filename="argh+!#$-123_|%26^`~.jpg"');
    expect(disposition.utf8Filename()).toBe("filename*=UTF-8''argh+!#$-123_|&^`~.jpg");
    expect(disposition.toString()).toBe(
      `inline; ${disposition.asciiFilename()}; ${disposition.utf8Filename()}`,
    );
  });

  it("without filename", () => {
    const disposition = new ContentDisposition({ disposition: "inline", filename: null });
    expect(disposition.toString()).toBe("inline");
  });
});
