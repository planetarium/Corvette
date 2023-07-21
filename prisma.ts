// @deno-types="./generated/client/index.d.ts"
import process from "node:process";
globalThis.process = process;
import * as _prisma from "./generated/client/index.d.ts";
import { createRequire } from "node:module";

type PrismaTypes = typeof _prisma;

const require = createRequire(import.meta.url);
const prisma: PrismaTypes = require("./generated/client");

export class PrismaClient extends prisma.PrismaClient {}
export type Prisma = PrismaTypes["Prisma"];
