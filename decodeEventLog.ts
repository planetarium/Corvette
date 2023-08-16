import type {
  Abi,
  AbiParameter,
  ExtractAbiEventNames,
  Narrow,
} from "https://esm.sh/abitype";

import {
  AbiDecodingDataSizeTooSmallError,
  AbiEventSignatureEmptyTopicsError,
  AbiEventSignatureNotFoundError,
  DecodeLogDataMismatch,
  DecodeLogTopicsMismatch,
} from "https://esm.sh/viem/dist/esm/errors/abi.js";
import type {
  EventDefinition,
  GetEventArgsFromTopics,
  InferEventName,
} from "https://esm.sh/viem/dist/types/types/contract.d.ts";
import type { Hex } from "https://esm.sh/viem/dist/types/types/misc.d.ts";
import type { Prettify } from "https://esm.sh/viem/dist/types/types/utils.d.ts";
import { getEventSelector } from "https://esm.sh/viem/dist/esm/utils/hash/getEventSelector.js";
import { decodeAbiParameters } from "https://esm.sh/viem/dist/esm/utils/abi/decodeAbiParameters.js";
import type { DecodeAbiParametersReturnType } from "https://esm.sh/viem/dist/types/utils/abi/decodeAbiParameters.d.ts";
import { formatAbiItem } from "https://esm.sh/viem/dist/esm/utils/abi/formatAbiItem.js";

export type DecodeEventLogParameters<
  TAbi extends Abi | readonly unknown[] = Abi,
  TEventName extends string | undefined = string,
  TTopics extends Hex[] = Hex[],
  TData extends Hex | undefined = undefined,
  TStrict extends boolean = true,
> = {
  abi: Narrow<TAbi>;
  data?: TData;
  eventName?: InferEventName<TAbi, TEventName>;
  strict?: TStrict;
  topics: [signature: Hex, ...args: TTopics] | [];
};

export type DecodeEventLogReturnType<
  TAbi extends Abi | readonly unknown[] = Abi,
  TEventName extends string | undefined = string,
  TTopics extends Hex[] = Hex[],
  TData extends Hex | undefined = undefined,
  TStrict extends boolean = true,
  _EventNames extends string = TAbi extends Abi ? Abi extends TAbi ? string
    : ExtractAbiEventNames<TAbi>
    : string,
> = TEventName extends _EventNames[number] ? Prettify<
    {
      eventName: TEventName;
    } & GetEventArgsFromTopics<TAbi, TEventName, TTopics, TData, TStrict>
  >
  : {
    [TName in _EventNames]: Prettify<
      {
        eventName: TName;
      } & GetEventArgsFromTopics<TAbi, TName, TTopics, TData, TStrict>
    >;
  }[_EventNames];

const docsPath = "/docs/contract/decodeEventLog";

export function decodeEventLog<
  TAbi extends Abi | readonly unknown[],
  TEventName extends string | undefined = undefined,
  TTopics extends Hex[] = Hex[],
  TData extends Hex | undefined = undefined,
  TStrict extends boolean = true,
>({
  abi,
  data,
  strict: strict_,
  topics,
}: DecodeEventLogParameters<
  TAbi,
  TEventName,
  TTopics,
  TData,
  TStrict
>): DecodeEventLogReturnType<TAbi, TEventName, TTopics, TData, TStrict> {
  const strict = strict_ ?? true;
  const [signature, ...argTopics] = topics;
  if (!signature) {
    throw new AbiEventSignatureEmptyTopicsError({
      docsPath,
    });
  }
  const abiItem = (abi as Abi).find(
    (x) =>
      x.type === "event" &&
      signature === getEventSelector(formatAbiItem(x) as EventDefinition),
  );
  if (!(abiItem && "name" in abiItem) || abiItem.type !== "event") {
    throw new AbiEventSignatureNotFoundError(signature, {
      docsPath,
    });
  }

  const { name, inputs } = abiItem;
  const indexedInputs = inputs.filter((x) => "indexed" in x && x.indexed);
  const nonIndexedInputs = inputs.filter((x) => !indexedInputs.includes(x));

  const decodedTopics: DecodeAbiParametersReturnType<typeof indexedInputs> = [];
  type decodedDataType = DecodeAbiParametersReturnType<typeof nonIndexedInputs>;
  let decodedData: decodedDataType = undefined as unknown as decodedDataType;

  // Decode topics (indexed args).
  if (argTopics.length > 0) {
    for (let i = 0; i < indexedInputs.length; i++) {
      const param = indexedInputs[i];
      const topic = argTopics[i];
      if (!topic) {
        throw new DecodeLogTopicsMismatch({
          abiItem,
          param: param as AbiParameter & { indexed: boolean },
        });
      }
      decodedTopics.push(decodeTopic({ param, value: topic }));
    }
  }

  // Decode data (non-indexed args).
  if (nonIndexedInputs.length > 0) {
    if (data && data !== "0x") {
      try {
        decodedData = decodeAbiParameters(nonIndexedInputs, data);
      } catch (err) {
        if (strict) {
          if (err instanceof AbiDecodingDataSizeTooSmallError) {
            throw new DecodeLogDataMismatch({
              abiItem,
              data: err.data,
              params: err.params,
              size: err.size,
            });
          }
          throw err;
        }
      }
    } else if (strict) {
      throw new DecodeLogDataMismatch({
        abiItem,
        data: "0x",
        params: nonIndexedInputs,
        size: 0,
      });
    }
  }

  const names = inputs.filter((x) => ("name" in x && x.name)).map((x) =>
    x.name!
  );
  type ValueOf<T> = T[keyof T];
  type Args =
    & Array<ValueOf<typeof decodedTopics | typeof decodedData>>
    & {
      [K in typeof names[number]]: ValueOf<
        typeof decodedTopics | typeof decodedData
      >[K];
    };
  const args: Args = inputs
    .reduce(
      (acc, x) => {
        const arg = indexedInputs.includes(x)
          ? decodedTopics.shift()
          : decodedData
          ? decodedData.shift()
          : undefined;
        if (arg !== undefined) {
          acc.push(arg);
        }
        if (x.name) {
          acc[x.name] = arg;
        }
        return acc;
      },
      [] as unknown as Args,
    );

  return {
    eventName: name,
    args: args.length > 0 ? args : undefined,
  } as unknown as DecodeEventLogReturnType<
    TAbi,
    TEventName,
    TTopics,
    TData,
    TStrict
  >;
}

function decodeTopic({ param, value }: { param: AbiParameter; value: Hex }) {
  if (
    param.type === "string" ||
    param.type === "bytes" ||
    param.type === "tuple" ||
    param.type.match(/^(.*)\[(\d+)?\]$/)
  ) {
    return value;
  }
  const decodedArg = decodeAbiParameters([param], value) || [];
  return decodedArg[0];
}
