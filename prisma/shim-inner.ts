import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import process from "node:process";

import * as _prismaTypes from "./client/index.d.ts";

Object.assign(globalThis, { process, Buffer });

const require = createRequire(import.meta.url);
const prisma: typeof _prismaTypes = require("./client");

export type * from "./client/index.d.ts";
export class PrismaClient extends prisma.PrismaClient {}
export default prisma.Prisma;
