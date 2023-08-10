import { LogLevels } from "std/log/levels.ts";

import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { prisma } from "~/main.ts";
import { logRequest, redirect } from "~/util.ts";
import { hash } from "~/argon2.ts";

export const handler: Handlers<unknown, WithSession> = {
  async POST(req, ctx) {
    const form = await req.formData();
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (!email || !password) {
      const message = "Empty email/password";
      logRequest(LogLevels.DEBUG, req, ctx, Status.BadRequest, message);
      return new Response(message, { status: Status.BadRequest });
    }

    logRequest(LogLevels.INFO, req, ctx, Status.OK, `Creating user: ${email}`);
    const user = await prisma.user.create({
      data: {
        email,
        password: await hash(password),
      },
    });

    ctx.state.session.set("user", user);

    return redirect(req, ctx);
  },
};
