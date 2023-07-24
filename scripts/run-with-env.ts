import { load } from "https://deno.land/std@0.194.0/dotenv/mod.ts";

if (Deno.args.length > 0) {
  new Deno.Command(Deno.args[0], {
    args: Deno.args.slice(1),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: await load({ examplePath: null, defaultsPath: null }),
    cwd: Deno.cwd(),
    uid: Deno.uid() !== null ? Deno.uid()! : undefined,
    gid: Deno.gid() !== null ? Deno.gid()! : undefined,
  }).spawn().ref();
}
