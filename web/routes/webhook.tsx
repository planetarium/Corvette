import { Handlers, PageProps, Status } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { ListWebhook, type WebhookEntry } from "~/islands/ListWebhook.tsx";
import { getCookieString, getServerSideUrl, logRequest } from "~/util.ts";
import { logger } from "~root/web/main.ts";

export const handler: Handlers<WebhookEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/webhook/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      logRequest(logger.error, req, ctx, Status.InternalServerError, "Failed to retrieve webhook entries")
      throw new Error(await res.text());
    }
    logRequest(logger.info, req, ctx, Status.OK)
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
