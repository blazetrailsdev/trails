import { callerLocations } from "../../../../packages/activesupport/src/deprecation.js";

function inner(): void {
  const all = callerLocations();
  console.log("count:", all.length);
  const one = callerLocations(1, 1);
  console.log("one.length:", one.length);
  console.log("one[0] defined:", one[0] != null);
  console.log("one[0].path:", JSON.stringify(one[0]?.path));
  console.log("one[0].lineno:", one[0]?.lineno);
}
inner();
