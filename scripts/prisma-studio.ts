import { combinedEnv } from "../runHelpers.ts";

new Deno.Command("npx", {
  args: [
    "prisma",
    "studio",
  ],
  env: {
    "DATABASE_URL": combinedEnv["DIRECT_URL"],
  },
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
}).spawn().ref();
