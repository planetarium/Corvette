import { parse } from "std/flags/mod.ts";
import * as path from "std/path/mod.ts";

import { baseDir } from "../../moduleUtils.ts";

type GetSchemaOptions = { useParams: boolean };

export function getSchemaPath(
  options: GetSchemaOptions = { useParams: false },
) {
  return options.useParams &&
      parse(Deno.args, { string: ["schema"] }).schema ||
    path.join(baseDir, "prisma", "schema.prisma");
}

export async function getSchema(
  options: GetSchemaOptions = { useParams: false },
) {
  return await Deno.readTextFile(getSchemaPath(options));
}
