import { Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { logger, prisma } from "~/main.ts";
import { logRequest, redirect } from "~/util.ts";
import { verify } from "~/argon2.ts";

export const handler: Handlers<unknown, WithSession> = {
  async POST(req, ctx) {
    const form = await req.formData();
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (!email || !password) {
      const message = "Empty email/password";
      logRequest(logger.debug, req, ctx, Status.BadRequest, message);
      return new Response(message, { status: Status.BadRequest });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || (await verify(password, user.password))) {
      logRequest(
        logger.warning,
        req,
        ctx,
        Status.OK,
        `Tried to log in user: ${email}, bad ${
          !user ? "username" : "password"
        }`,
      );
      return new Response("Invalid email/password", {
        status: Status.Unauthorized,
      });
    }

    logRequest(logger.info, req, ctx, Status.OK, `Logging in user: ${email}`);
    ctx.state.session.set("user", user);

    return redirect(req, ctx);
  },
};
