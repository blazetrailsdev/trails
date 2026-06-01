import { User } from "./user.js";

const user = new User();
export const name: string = user.name;
export const age: number = user.age;
export const isAdmin: boolean = user.is_admin;
