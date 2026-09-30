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
  genCol?: number;
  srcCol?: number;
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
  let prevSrcCol = 0;
  for (const m of sorted) {
    while (prevGen < m.genLine) {
      segs.push("");
      prevGen++;
    }
    const srcCol = m.srcCol ?? 0;
    segs.push(
      encodeVlq(m.genCol ?? 0) +
        encodeVlq(0) +
        encodeVlq(m.srcLine - prevSrc) +
        encodeVlq(srcCol - prevSrcCol),
    );
    prevSrc = m.srcLine;
    prevSrcCol = srcCol;
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

function decodeVlqSegment(segment: string): number[] {
  const fields: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = VLQ.indexOf(ch);
    value += (digit & 0x1f) << shift;
    if (digit & 0x20) {
      shift += 5;
      continue;
    }
    fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return fields;
}

export function decodeLineMappings(mappings: string): LineMapping[] {
  const out: LineMapping[] = [];
  let srcLine = 0;
  let srcCol = 0;
  mappings.split(";").forEach((line, genLine) => {
    let first = true;
    let genCol = 0;
    for (const segment of line.split(",")) {
      const fields = decodeVlqSegment(segment);
      if (fields.length < 4) continue;
      genCol += fields[0];
      srcLine += fields[2];
      srcCol += fields[3];
      if (first) out.push({ genLine, srcLine, genCol, srcCol });
      first = false;
    }
  });
  return out;
}
