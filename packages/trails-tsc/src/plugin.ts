export interface TscPlugin {
  readonly name: string;
  readonly extensions: readonly string[];
  virtualize(filePath: string, source: string): VirtualizeOutput | null;
}

export interface VirtualizeOutput {
  ts: string;
  deltas?: readonly LineDelta[];
}

export interface LineDelta {
  insertedAtLine: number;
  lineCount: number;
}
