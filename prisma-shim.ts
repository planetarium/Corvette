import { createRequire } from "node:module";
import process from "node:process";
import { Buffer } from "node:buffer";

import * as _prisma from "./generated/client/index.js";
import * as _prismaTypes from "./generated/client/index.d.ts";

type PrismaTypes = typeof _prismaTypes;

Object.assign(globalThis, { process, Buffer });

const require = createRequire(import.meta.url);
const prisma: PrismaTypes = require("./generated/client");

export class PrismaClient extends prisma.PrismaClient {}
// re-export namespace Prisma
// deno-lint-ignore no-unused-vars
export import Prisma = _prismaTypes.Prisma;
