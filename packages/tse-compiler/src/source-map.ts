/** V3 source map generator — line-level mappings, no external deps. */

const VLQ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = "";
  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20;
    out += VLQ[digit];
  } while (vlq > 0);
  return out;
}

export interface LineMapping {
  genLine: number;
  srcLine: number;
}

export interface RawSourceMap {
  version: 3;
  file: string;
  sourceRoot: string;
  sources: string[];
  sourcesContent: (string | null)[];
  mappings: string;
}

export function generateSourceMap(
  file: string,
  sourceFile: string,
  sourceContent: string | null,
  mappings: readonly LineMapping[],
): RawSourceMap {
  const sorted = [...mappings].sort((a, b) => a.genLine - b.genLine);
  const segs: string[] = [];
  let prevGen = 0;
  let prevSrc = 0;
  for (const m of sorted) {
    while (prevGen < m.genLine) {
      segs.push("");
      prevGen++;
    }
    segs.push(encodeVlq(0) + encodeVlq(0) + encodeVlq(m.srcLine - prevSrc) + encodeVlq(0));
    prevSrc = m.srcLine;
    prevGen++;
  }
  return {
    version: 3,
    file,
    sourceRoot: "",
    sources: [sourceFile],
    sourcesContent: [sourceContent],
    mappings: segs.join(";"),
  };
}
