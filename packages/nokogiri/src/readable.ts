export interface Readable {
  read(): string | null;
}

export function readSource(data: string | Readable): string {
  return typeof data === "string" ? data : (data.read() ?? "");
}
