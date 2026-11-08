export interface Readable {
  read(): string | null;
  isEmpty?(): boolean;
  isEof?(): boolean;
}

export function readSource(data: string | Readable): string {
  return typeof data === "string" ? data : (data.read() ?? "");
}
