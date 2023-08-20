import { load } from "std/dotenv/mod.ts";

export const combinedEnv = { ...(await load()), ...Deno.env.toObject() };
export const DatabaseUrlEnvKey = "DATABASE_URL";
export const ChainDefinitionUrlEnvKey = "CHAIN_DEFINITION_URL";
export const AmqpBrokerUrlEnvKey = "AMQP_BROKER_URL";
export const ApiUrlEnvKey = "API_URL";
export const ApiExternalUrlEnvKey = "API_EXTERNAL_URL";
export const ApiBehindReverseProxyEnvKey = "API_BEHIND_REVERSE_PROXY";
export const WebUIUrlEnvKey = "WEBUI_URL";
export const WebUISessionAppKeyEnvKey = "WEBUI_SESSION_APP_KEY";
export const BlockFinalityEnvKey = "BLOCK_FINALITY";
export const LogLevelEnvKey = "LOG_LEVEL";
