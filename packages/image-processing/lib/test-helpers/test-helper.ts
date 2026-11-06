import { Image as MiniMagickImage } from "@blazetrails/mini-magick/image";
import { File, IO, Tempfile } from "@blazetrails/ruby-compat";
import { expect } from "vitest";
import Vips from "wasm-vips";
import { IDHash } from "./dhash-vips.js";

type PathLike = { path(): string | null };

export function fixtureImage(name: string): File {
  return File.open(File.join(File.expandPath("fixtures", import.meta.dirname), name), "rb");
}

export function copyToTempfile(io: IO, extension: string | null = null): Tempfile {
  const tempfile = Tempfile.new(extension != null ? ["copy", extension] : "copy", null, {
    binmode: true,
  });
  IO.copyStream(io, tempfile);
  io.rewind();
  tempfile.open();
  return tempfile;
}

export async function assertSimilar(image1: PathLike, image2: PathLike): Promise<void> {
  expect(await distance(image1, image2)).toBeLessThanOrEqual(3);
}

export async function refuteSimilar(image1: PathLike, image2: PathLike): Promise<void> {
  expect(await distance(image1, image2)).toBeGreaterThan(3);
}

export async function assertDimensions(dimensions: [number, number], file: PathLike) {
  const image = (await Vips()).Image.newFromFile(file.path()!);
  expect([image.width, image.height]).toEqual(dimensions);
}

export async function assertType(type: string, file: PathLike) {
  expect(await new MiniMagickImage(file.path()!).type()).toEqual(type);
}

export async function distance(image1: PathLike, image2: PathLike): Promise<number> {
  const hash1 = await IDHash.fingerprint(image1.path()!);
  const hash2 = await IDHash.fingerprint(image2.path()!);

  return IDHash.distance(hash1, hash2);
}
