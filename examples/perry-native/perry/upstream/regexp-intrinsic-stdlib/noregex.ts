async function touchStdlib(): Promise<void> {
  try {
    const r = await fetch("http://127.0.0.1:1/never");
    console.log("status", r.status);
  } catch {
    console.log("fetch rejected, as expected");
  }
}
console.log("no regex here");
void touchStdlib();
