import Vips from "wasm-vips";

type Image = InstanceType<Awaited<ReturnType<typeof Vips>>["Image"]>;

let _vips: Promise<Awaited<ReturnType<typeof Vips>>> | undefined;

/** @internal */
function vips() {
  return (_vips ??= Vips());
}

export function bw(image: Image): Image {
  return (image.hasAlpha() ? image.flatten({ background: 255 }) : image)
    .colourspace("b-w")
    .extractBand(0);
}

export const IDHash = {
  distance3Ruby(a: bigint, b: bigint): number {
    return popcount((a ^ b) & ((a | b) >> 128n));
  },

  distance3(a: bigint, b: bigint): number {
    return IDHash.distance3Ruby(a, b);
  },

  distance(a: bigint, b: bigint): number {
    const [sizeA, sizeB] = [a, b].map((x) => (integerSize(x) <= 32 ? 8 : 16));
    if (sizeA === 8 && sizeB === 8) return IDHash.distance3(a, b);
    if (sizeA !== sizeB) {
      throw new globalThis.Error(
        `fingerprints were taken with different \`power\` param: ${sizeA} and ${sizeB}`,
      );
    }
    return popcount((a ^ b) & ((a | b) >> BigInt(2 * sizeA * sizeA)));
  },

  /** @internal */
  median(array: number[]): number {
    const h = Math.floor(array.length / 2);
    if (array[h] !== array.at(h - 1)) return array[h];
    const right = [...array];
    const left = right.splice(0, h);
    if (right.length > left.length) right.shift();
    if (left.at(-1) !== right[0]) return right[0];
    const count = (a: number[], v: number | undefined) => a.filter((x) => x === v).length;
    if (count(left, left.at(-1)) > count(right, right[0])) return [...new Set(right)][1];
    return left.at(-1)!;
  },

  async fingerprint(input: string | Image, power = 3): Promise<bigint> {
    const size = 2 ** power;
    const image =
      typeof input === "string"
        ? (await vips()).Image.thumbnail(input, size, { height: size, size: "force" })
        : input.thumbnailImage(size, { height: size, size: "force" });
    const pixels = bw(image).writeToMemory();
    const array = Array.from({ length: size }, (_, y) =>
      Array.from(pixels.subarray(y * size, (y + 1) * size)),
    );
    const transpose = array[0].map((_, x) => array.map((row) => row[x]));
    const [d1, i1, d2, i2] = [array, transpose].flatMap((a) => {
      const d = a.flatMap((r1, k) => {
        const r2 = a[(k + 1) % a.length];
        return r1.map((i, j) => i - r2[j]);
      });
      const m = IDHash.median(d.map(Math.abs).sort((x, y) => x - y));
      return [
        BigInt(`0b${d.map((c) => (c < 0 ? 1 : 0)).join("")}`),
        BigInt(`0b${d.map((c) => (Math.abs(c) >= m ? 1 : 0)).join("")}`),
      ];
    });
    const n = BigInt(size * size);
    return (((((i1 << n) + i2) << n) + d1) << n) + d2;
  },
};

function integerSize(x: bigint): number {
  const bytes = Math.ceil(x.toString(16).length / 2);
  return Math.max(8, Math.ceil(bytes / 8) * 8);
}

function popcount(x: bigint): number {
  return x.toString(2).replaceAll("0", "").length;
}
