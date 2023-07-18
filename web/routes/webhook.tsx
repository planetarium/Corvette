import { Handlers, PageProps } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { ListWebhook, type WebhookEntry } from "~/islands/ListWebhook.tsx";

const fetchWebhook = (): Promise<WebhookEntry[]> => {
  return fetch("http://localhost:8000/webhook", {
    method: "POST",
  }).then((res) => res.json());
};

export const handler: Handlers<WebhookEntry[]> = {
  async GET(_req, ctx) {
    return ctx.render(await fetchWebhook());
  },
};

export default (props: PageProps<WebhookEntry[]>) => {
  return (
    <Layout title="Webhooks">
      <ListWebhook entries={props.data} />
    </Layout>
  );
};
