import { getSchemaPath, shouldUseDataproxy } from "../prismaSchemaUtils.ts";

// script to automatically generate (non-)dataproxy prisma client depending on datasource provider
let dataproxy: boolean;
try {
  dataproxy = await shouldUseDataproxy({ useParams: true });
} catch (e) {
  console.error(`Could not load ${getSchemaPath({ useParams: true })}`);
  throw e;
}

await new Deno.Command("deno", {
  args: [
    "task",
    "prisma",
    "generate",
    ...(dataproxy ? ["--data-proxy"] : []),
    ...Deno.args,
  ],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  cwd: Deno.cwd(),
  uid: Deno.uid() !== null ? Deno.uid()! : undefined,
  gid: Deno.gid() !== null ? Deno.gid()! : undefined,
}).spawn().status;
