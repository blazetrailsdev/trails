export interface Readable {
  read(): string | null;
  isEof?(): boolean;
}

export function readSource(data: string | Readable): string {
  return typeof data === "string" ? data : (data.read() ?? "");
}
