async function touchStdlib(): Promise<void> {
  try {
    const r = await fetch("http://127.0.0.1:1/never");
    console.log("status", r.status);
  } catch {
    console.log("fetch rejected, as expected");
  }
}
function later(): boolean {
  const re = /^a(b+)c$/;
  return re.test("abbc");
}
console.log("start");
void touchStdlib();
console.log("lazy match:", later());
