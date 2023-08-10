import { decode, encode } from "bencodex";

export type ReloadControlMessage = { action: "reload" };

export type EmitterControlMessages =
  | ReloadControlMessage
  | never;

export type ObserverControlMessages =
  | ReloadControlMessage
  | never;

export type ControlMessage = EmitterControlMessages | ObserverControlMessages;
export type MarshaledControlMessage = [ReloadControlMessage["action"]];

export function serializeControlMessage(msg: ControlMessage): Uint8Array {
  return encode([msg.action] satisfies MarshaledControlMessage);
}

export function deserializeControlMessage(data: Uint8Array): ControlMessage {
  const msg = decode(data) as MarshaledControlMessage;
  const [action] = msg;
  return { action } satisfies ControlMessage;
}
