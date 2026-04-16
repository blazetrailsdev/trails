import { User } from "./user.js";
import { Admin } from "./admin.js";

const user = new User();
export const userName: string = user.name;

const admin = new Admin();
export const adminRole: string = admin.role;
export const adminName: string = admin.name;
