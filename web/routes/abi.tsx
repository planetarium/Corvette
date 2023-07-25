import { Handlers, PageProps } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { type AbiEntry, ListAbi } from "~/islands/ListAbi.tsx";
import { getCookieString, getOrigin } from "~/util.ts";

export const handler: Handlers<AbiEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(`${getOrigin(req)}/api/abi/`, {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return ctx.render(await res.json());
  },
};

export default (props: PageProps<AbiEntry[]>) => {
  return (
    <Layout title="ABI">
      <ListAbi entries={props.data} />
    </Layout>
  );
};
