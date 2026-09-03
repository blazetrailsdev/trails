export function isStreamingRequest(options: Record<string, unknown>): boolean {
  return options.stream === true;
}

export function prepareStreamingHeaders(headers: Record<string, string>): void {
  const hasCC = Object.keys(headers).some((k) => k.toLowerCase() === "cache-control");
  if (!hasCC) {
    headers["cache-control"] = "no-cache";
  }
}
