import ajvFormats from "https://esm.sh/ajv-formats@2.1.1";
import Ajv, { type JSONSchemaType } from "https://esm.sh/ajv@8.12.0";

const ajv = new Ajv({ allowUnionTypes: true });
ajvFormats(ajv);

interface EventRequest {
  blockIndex?: number;
  blockHash?: string;
  blockFrom?: number | string;
  blockTo?: number | string;
  logIndex?: number;
  transactionHash?: string;
  sourceAddress?: string;
  abiHash?: string;
  abiSignature?: string;
  after?: string;
  before?: string;
}

const eventRequestSchema: JSONSchemaType<EventRequest> = {
  type: "object",
  properties: {
    blockIndex: { type: "number", nullable: true },
    blockHash: {
      type: "string",
      nullable: true,
      pattern: "^(0x)?[a-fA-F0-9]{64}$",
    },
    blockFrom: {
      type: ["number", "string"],
      nullable: true,
      anyOf: [
        { type: "number" },
        { type: "string", pattern: "^(0x)?[a-fA-F0-9]{64}$" },
      ],
    },
    blockTo: {
      type: ["number", "string"],
      nullable: true,
      anyOf: [
        { type: "number" },
        { type: "string", pattern: "^(0x)?[a-fA-F0-9]{64}$" },
      ],
    },
    logIndex: { type: "number", nullable: true },
    transactionHash: {
      type: "string",
      nullable: true,
      pattern: "^(0x)?[a-fA-F0-9]{64}$",
    },
    sourceAddress: {
      type: "string",
      nullable: true,
      pattern: "^(0x)?[a-fA-F0-9]{40}$",
    },
    abiHash: {
      type: "string",
      nullable: true,
      pattern: "^(0x)?[a-fA-F0-9]{64}$",
    },
    abiSignature: { type: "string", nullable: true },
    after: { type: "string", nullable: true, format: "date-time" },
    before: { type: "string", nullable: true, format: "date-time" },
  },
  allOf: [
    {
      oneOf: [
        {
          allOf: [
            { not: { required: ["blockHash"] } },
            { not: { required: ["blockIndex"] } },
            { not: { required: ["blockFrom"] } },
            { not: { required: ["blockTo"] } },
          ],
        },
        { required: ["blockHash"] },
        { required: ["blockIndex"] },
        { anyOf: [{ required: ["blockFrom"] }, { required: ["blockTo"] }] },
      ],
    },
    {
      oneOf: [
        {
          allOf: [
            { not: { required: ["abiHash"] } },
            { not: { required: ["abiSignature"] } },
          ],
        },
        { required: ["abiHash"] },
        { required: ["abiSignature"] },
      ],
    },
  ],
};

export const validateEventRequest = ajv.compile(eventRequestSchema);
