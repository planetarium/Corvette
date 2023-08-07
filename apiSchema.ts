import Ajv, { type JSONSchemaType } from "https://esm.sh/ajv@8.12.0";
import ajvFormats from "https://esm.sh/ajv-formats@3.0.0-rc.0";

const ajv = new Ajv();
ajvFormats(ajv);

interface EventRequest {
  blockHash?: string;
  blockIndex?: number;
  blockFrom?: number;
  blockTo?: number;
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
    blockHash: { type: "string", nullable: true },
    blockIndex: { type: "number", nullable: true },
    blockFrom: { type: "number", nullable: true },
    blockTo: { type: "number", nullable: true },
    logIndex: { type: "number", nullable: true },
    transactionHash: { type: "string", nullable: true },
    sourceAddress: { type: "string", nullable: true },
    abiHash: { type: "string", nullable: true },
    abiSignature: { type: "string", nullable: true },
    after: { type: "string", nullable: true, format: "iso-date-time" },
    before: { type: "string", nullable: true, format: "iso-date-time" },
  },
  allOf: [
    {
      oneOf: [
        {
          allOf: [
            { not: { required: ["blockHash"] } },
            { not: { required: ["blockIndex"] } },
            {
              not: {
                anyOf: [{ required: ["blockFrom"] }, { required: ["blockTo"] }],
              },
            },
          ],
        },
        { required: ["blockHash"] },
        { required: ["blockIndex"] },
        { anyOf: [{ required: ["blockFrom"] }, { required: ["blockTo"] }] },
      ],
    },
    {
      oneOf: [
        { not: { required: ["transactionHash"] } },
        { required: ["transactionHash"] },
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
