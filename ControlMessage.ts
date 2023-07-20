import { decode, encode } from "https://deno.land/x/bencodex@0.2.2/mod.ts";

export type ControlMessage = { action: "reload" };
export type MarshaledControlMessage = ["reload"];

export const ReloadControlMessage: ControlMessage = { action: "reload" };

export type EmitterControlMessages =
  | typeof ReloadControlMessage
  | never;

export type ObserverControlMessages =
  | typeof ReloadControlMessage
  | never;

export function serializeControlMessage(msg: ControlMessage): Uint8Array {
  return encode([msg.action] satisfies MarshaledControlMessage);
}

export function deserializeControlMessage(data: Uint8Array): ControlMessage {
  const msg = decode(data) as MarshaledControlMessage;
  const [action] = msg;
  return { action } satisfies ControlMessage;
}
