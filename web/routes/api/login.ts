import { Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { prisma } from "~/main.ts";
import { redirect } from "~/util.ts";
import { verify } from "~/argon2.ts";

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
    if (!user || (await verify(password, user.password))) {
      return new Response("Invalid email/password", {
        status: Status.Unauthorized,
      });
    }

    ctx.state.session.set("user", user);

    return redirect(req, ctx);
  },
};
