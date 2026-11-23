/** The bytes as a string of one character per byte, built in chunks a spread argument list can hold. */
export function latin1(data: Uint8Array): string {
  let s = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return s;
}
