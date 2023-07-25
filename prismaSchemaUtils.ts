import { parse } from "https://deno.land/std@0.194.0/flags/mod.ts";
import * as path from "https://deno.land/std@0.194.0/path/mod.ts";

import { baseDir } from "./moduleUtils.ts";

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

export async function shouldUseDataproxy(
  options: GetSchemaOptions = { useParams: false },
) {
  const schema = await getSchema(options);
  return schema.match(
    /datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"sqlite"[\s\S]*?\}/,
  ) != null;
}
