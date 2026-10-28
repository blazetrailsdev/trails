// Does merely importing activesupport's include crash? No cycle, no classes.
import { include } from "@blazetrails/activesupport";
console.log("[Z1] imported, typeof include =", typeof include);
