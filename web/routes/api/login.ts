import { Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";
import { decode } from "std/encoding/base64.ts";

import argon2 from "https://esm.sh/argon2-browser@1.18.0/dist/argon2-bundled.min.js";

import { prisma } from "~/main.ts";
import { redirect } from "~/util.ts";

export const handler: Handlers<unknown, WithSession> = {
  async POST(req, ctx) {
    const form = await req.formData();
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (!email || !password) {
      return new Response("Empty email/password", {
        status: Status.BadRequest,
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      user.password !==
        (
          await argon2.hash({
            pass: password,
            salt: decode(user.password.split("$")[4]),
            type: argon2.ArgonType.Argon2id,
          })
        ).encoded
    ) {
      return new Response("Invalid email/password", {
        status: Status.Unauthorized,
      });
    }

    ctx.state.session.set("user", user);

    return redirect(req);
  },
};
