import { Handlers, PageProps } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { ListWebhook, type WebhookEntry } from "~/islands/ListWebhook.tsx";
import { getCookieString, getServerSideUrl } from "~/util.ts";

export const handler: Handlers<WebhookEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/webhook/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
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
