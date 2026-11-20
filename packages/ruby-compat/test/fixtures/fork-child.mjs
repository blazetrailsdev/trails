import { exitBang, rbForkPayload, rbForkedPipe } from "../../dist/index.js";

const { exitstatus } = rbForkPayload();
const [reader, writer] = rbForkedPipe(0);
reader.close();
writer.write(".");
writer.close();
setTimeout(() => exitBang(exitstatus), 50);
