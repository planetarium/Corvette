#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "fresh/dev.ts";

const main = async () => {
  // dev(import.meta.url, "./main.ts") doesn't init node:process streams
  await dev(import.meta.url, "");
  await import("./main.ts");
};

main();
