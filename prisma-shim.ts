import { createRequire } from "node:module";
import process from "node:process";
import { Buffer } from "node:buffer";

import * as _prismaTypes from "./generated/client/index.d.ts";

Object.assign(globalThis, { process, Buffer });

const require = createRequire(import.meta.url);
const prisma: typeof _prismaTypes = require("./generated/client");

export class PrismaClient extends prisma.PrismaClient {}
// re-export namespace Prisma as default export
export default prisma.Prisma;
