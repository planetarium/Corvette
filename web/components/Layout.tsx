import { Head } from "fresh/runtime.ts";
import type { ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
  title?: string;
}

export default function Layout({ children, ...props }: Props) {
  return (
    <>
      <Head>
        <title>Corvette</title>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@3.1.10/dist/full.css"
          rel="stylesheet"
          type="text/css"
        />
      </Head>
      <nav class="navbar bg-base-100 mx-6">
        <a href="/abi" class="btn btn-ghost text-xl">
          ABI
        </a>
        <a href="/sources" class="btn btn-ghost text-xl">
          Event Sources
        </a>
        <a href="/webhook" class="btn btn-ghost text-xl">
          Webhooks
        </a>
      </nav>
      <div class="h-screen p-4 container mx-auto">
        {props.title && (
          <div class="text-4xl font-extrabold pb-4 px-2">{props.title}</div>
        )}
        {children}
      </div>
    </>
  );
}
