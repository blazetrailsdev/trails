/** @internal */
let _formatVersion = 7.0;

export function getFormatVersion(): number {
  return _formatVersion;
}

export function setFormatVersion(value: number): void {
  _formatVersion = value;
}
