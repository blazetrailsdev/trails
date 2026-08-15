/**
 * The duck type Nokogiri's parsers accept alongside a String: anything
 * answering `read`. `Nokogiri::XML(data)` and `Nokogiri::XML::SAX::Parser#parse`
 * both take an IO and let libxml pull from it.
 */
export interface Readable {
  read(): string | null;
}

export function readSource(data: string | Readable): string {
  return typeof data === "string" ? data : (data.read() ?? "");
}
