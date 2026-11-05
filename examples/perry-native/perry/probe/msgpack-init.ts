async function main(): Promise<void> {
  try {
    const m = await import("@blazetrails/activesupport/message-pack");
    console.log("message-pack loaded:", typeof m.MessagePack);
  } catch (e) {
    const err = e as Error;
    console.log("FAILED:", err.name, err.message);
    console.log(err.stack ?? "(no stack)");
  }
}
console.log("start");
void main();
