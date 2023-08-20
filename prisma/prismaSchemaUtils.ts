import { parse } from "std/flags/mod.ts";
import * as path from "std/path/mod.ts";

type GetSchemaOptions = { useParams: boolean };

// XXX: this const should be changed to point to the root source code directory whenever this
// file is moved.
const relativeToBase = ".";
export const prismaBaseDir = path.join(
  path.dirname(path.fromFileUrl(import.meta.url)),
  relativeToBase,
);

export function getSchemaPath(
  options: GetSchemaOptions = { useParams: false },
) {
  return options.useParams &&
      parse(Deno.args, { string: ["schema"] }).schema ||
    path.join(prismaBaseDir, "prisma", "schema.prisma");
}

export async function getSchema(
  options: GetSchemaOptions = { useParams: false },
) {
  return await Deno.readTextFile(getSchemaPath(options));
}
