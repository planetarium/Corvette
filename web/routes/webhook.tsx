import { LogLevels } from "std/log/levels.ts";

import { type Handlers, type PageProps, Status } from "fresh/server.ts";

import { getCookieString, getServerSideUrl, logRequest } from "~/util.ts";

import { Layout } from "~/components/Layout.tsx";
import { ListWebhook, type WebhookEntry } from "~/islands/ListWebhook.tsx";

export const handler: Handlers<WebhookEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/webhook/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      logRequest(
        LogLevels.ERROR,
        req,
        ctx,
        Status.InternalServerError,
        "Failed to retrieve webhook entries",
      );
      throw new Error(await res.text());
    }
    logRequest(LogLevels.INFO, req, ctx, Status.OK);
    return ctx.render(await res.json());
  },
};

export default (props: PageProps<WebhookEntry[]>) => {
  return (
    <Layout title="Webhooks">
      <ListWebhook entries={props.data} />
    </Layout>
  );
};
