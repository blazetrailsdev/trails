export class MediaType {
  static SPLIT_PATTERN = /[;,]/;

  static type(contentType: string | null | undefined): string | null {
    if (!contentType || contentType.length === 0) return null;
    const t = contentType.split(MediaType.SPLIT_PATTERN, 2)[0];
    return t.trimEnd().toLowerCase();
  }

  static params(contentType: string | null | undefined): Record<string, string> {
    if (contentType == null) return {};

    const hsh: Record<string, string> = {};
    for (let s of contentType.split(MediaType.SPLIT_PATTERN).slice(1)) {
      s = s.trim();
      const i = s.indexOf("=");
      const kv = i === -1 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
      let k = kv[0]!;
      const v = kv[1];
      k = k.toLowerCase();
      hsh[k] = MediaType.stripDoublequotes(v);
    }
    return hsh;
  }

  /** @internal */
  private static stripDoublequotes(str: string | undefined): string {
    return str && str.startsWith('"') && str.endsWith('"') ? str.slice(1, -1) : str || "";
  }
}
