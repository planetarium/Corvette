import { load } from "https://deno.land/std@0.194.0/dotenv/mod.ts";

export const combinedEnv = { ...(await load()), ...Deno.env.toObject() };
export const DatabaseUrlEnvKey = "DATABASE_URL";
export const DirectDatabaseUrlEnvKey = "DIRECT_URL";
export const ChainDefinitionUrlEnvKey = "CHAIN_DEFINITION_URL";
export const AmqpBrokerUrlEnvKey = "AMQP_BROKER_URL";
export const DataproxyInternalPortEnvKey = "DATAPROXY_INTERNAL_PORT";
export const ApiUrlEnvKey = "API_URL";
export const ApiExternalUrlEnvKey = "API_EXTERNAL_URL";
export const WebUIUrlEnvKey = "WEBUI_URL";
export const WebUISessionAppKeyEnvKey = "WEBUI_SESSION_APP_KEY";
export const BlockFinalityEnvKey = "BLOCK_FINALITY";
