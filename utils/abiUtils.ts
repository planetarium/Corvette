import type {
  Abi,
  AbiConstructor,
  AbiError,
  AbiEvent,
  AbiEventParameter,
  AbiFallback,
  AbiFunction,
  AbiParameter,
  AbiReceive,
  ExtractAbiEventNames,
  Narrow,
} from "abitype";
import type { Join } from "abitype/dist/types/types.d.ts";
// @deno-types="abitype/dist/types/regex.d.ts"
import { execTyped } from "abitype/dist/esm/regex.js";

import {
  AbiDecodingDataSizeTooSmallError,
  AbiEventSignatureEmptyTopicsError,
  AbiEventSignatureNotFoundError,
  DecodeLogDataMismatch,
  DecodeLogTopicsMismatch,
} from "viem/dist/esm/errors/abi.js";
import type {
  EventDefinition,
  GetEventArgsFromTopics,
  InferEventName,
} from "viem/dist/types/types/contract.d.ts";
import type { Hex } from "viem/dist/types/types/misc.d.ts";
import type { Prettify } from "viem/dist/types/types/utils.d.ts";
import { getEventSelector } from "viem/dist/esm/utils/hash/getEventSelector.js";
import { decodeAbiParameters } from "viem/dist/esm/utils/abi/decodeAbiParameters.js";
import type { DecodeAbiParametersReturnType } from "viem/dist/types/utils/abi/decodeAbiParameters.d.ts";
import { formatAbiItem } from "viem/dist/esm/utils/abi/formatAbiItem.js";

/**
 * Formats {@link AbiParameter} to human-readable ABI parameter prototype.
 *
 * @param TAbiParameter - ABI parameter
 * @returns Human-readable ABI parameter prototype
 *
 * @example
 * type Result = FormatAbiParameterPrototype<{ type: 'address'; name: 'from'; }>
 * //   ^? type Result = 'address'
 */
type FormatAbiParameterPrototype<
  TAbiParameter extends AbiParameter | AbiEventParameter,
> = TAbiParameter extends {
  type: `tuple${infer Array}`;
  components: infer Components extends readonly AbiParameter[];
} ? FormatAbiParameterPrototype<
    {
      // @ts-ignore: type is intended to be recursive
      type: `(${Join<
        {
          [K in keyof Components]: FormatAbiParameterPrototype<Components[K]>;
        },
        ","
      >})${Array}`;
    }
  >
  : `${TAbiParameter["type"]}`;

/**
 * Formats {@link AbiParameter}s to human-readable ABI parameter prototypes.
 *
 * @param TAbiParameters - ABI parameters
 * @returns Human-readable ABI parameter prototypes
 *
 * @example
 * type Result = FormatAbiParameterPrototypes<[
 *   // ^? type Result = 'address,uint256'
 *   { type: 'address'; name: 'from'; },
 *   { type: 'uint256'; name: 'tokenId'; },
 * ]>
 */
type FormatAbiParameterPrototypes<
  TAbiParameters extends readonly (AbiParameter | AbiEventParameter)[],
> = Join<
  {
    [K in keyof TAbiParameters]: FormatAbiParameterPrototype<TAbiParameters[K]>;
  },
  ","
>;

/**
 * Formats ABI item (e.g. error, event, function) into human-readable ABI item prototype
 *
 * @param TAbiItem - ABI item
 * @returns Human-readable ABI item prototype
 */
type FormatAbiItemPrototype<TAbiItem extends Abi[number]> = Abi[number] extends
  TAbiItem ? string
  :
    | (TAbiItem extends AbiFunction ? AbiFunction extends TAbiItem ? string
      : `${TAbiItem["name"]}(${FormatAbiParameterPrototypes<
        TAbiItem["inputs"]
      >})`
      : never)
    | (TAbiItem extends AbiEvent ? AbiEvent extends TAbiItem ? string
      : `${TAbiItem["name"]}(${FormatAbiParameterPrototypes<
        TAbiItem["inputs"]
      >})`
      : never)
    | (TAbiItem extends AbiError ? AbiError extends TAbiItem ? string
      : `${TAbiItem["name"]}(${FormatAbiParameterPrototypes<
        TAbiItem["inputs"]
      >})`
      : never)
    | (TAbiItem extends AbiConstructor
      ? AbiConstructor extends TAbiItem ? string
      : `constructor(${FormatAbiParameterPrototypes<
        TAbiItem["inputs"]
      >})`
      : never)
    | (TAbiItem extends AbiFallback ? AbiFallback extends TAbiItem ? string
      : "fallback()"
      : never)
    | (TAbiItem extends AbiReceive ? AbiReceive extends TAbiItem ? string
      : "receive()"
      : never);

const tupleRegex = /^tuple(?<array>(\[(\d*)\])*)$/;

/**
 * Formats {@link AbiParameter} to human-readable ABI parameter prototype.
 *
 * @param abiParameter - ABI parameter
 * @returns Human-readable ABI parameter prototype
 *
 * @example
 * const result = formatAbiParameterPrototype({ type: 'address', name: 'from' })
 * //    ^? const result: 'address'
 */
function formatAbiParameterPrototype<
  const TAbiParameter extends AbiParameter | AbiEventParameter,
>(abiParameter: TAbiParameter): FormatAbiParameterPrototype<TAbiParameter> {
  type Result = FormatAbiParameterPrototype<TAbiParameter>;

  let type = abiParameter.type;
  if (tupleRegex.test(abiParameter.type) && "components" in abiParameter) {
    type = "(";
    const length = abiParameter.components.length as number;
    for (let i = 0; i < length; i++) {
      const component = abiParameter.components[i]!;
      type += formatAbiParameterPrototype(component);
      if (i < length - 1) type += ",";
    }
    const result = execTyped<{ array?: string }>(tupleRegex, abiParameter.type);
    type += `)${result?.array ?? ""}`;
    return formatAbiParameterPrototype({
      // @ts-ignore: type is intended to be recursive
      ...abiParameter,
      type,
    });
  }
  return type as Result;
}

/**
 * Formats {@link AbiParameter}s to human-readable ABI parameter prototypes.
 *
 * @param abiParameters - ABI parameters
 * @returns Human-readable ABI parameter prototypes
 *
 * @example
 * const result = formatAbiParameterPrototypes([
 *   //  ^? const result: 'address,uint256'
 *   { type: 'address', name: 'from' },
 *   { type: 'uint256', name: 'tokenId' },
 * ])
 */
function formatAbiParameterPrototypes<
  const TAbiParameters extends readonly (AbiParameter | AbiEventParameter)[],
>(abiParameters: TAbiParameters): FormatAbiParameterPrototypes<TAbiParameters> {
  let params = "";
  const length = abiParameters.length;
  for (let i = 0; i < length; i++) {
    const abiParameter = abiParameters[i]!;
    params += formatAbiParameterPrototype(abiParameter);
    if (i !== length - 1) params += ",";
  }
  return params as FormatAbiParameterPrototypes<TAbiParameters>;
}

/**
 * Formats ABI item (e.g. error, event, function) into human-readable ABI item prototype
 *
 * @param abiItem - ABI item
 * @returns Human-readable ABI item
 */
export function formatAbiItemPrototype<const TAbiItem extends Abi[number]>(
  abiItem: TAbiItem,
): FormatAbiItemPrototype<TAbiItem> {
  type Result = FormatAbiItemPrototype<TAbiItem>;
  type Params = readonly (AbiParameter | AbiEventParameter)[];

  if (
    abiItem.type === "function" ||
    abiItem.type === "event" ||
    abiItem.type === "error"
  ) {
    return `${abiItem.name}(${
      formatAbiParameterPrototypes(
        abiItem.inputs as Params,
      )
    })`;
  } else if (abiItem.type === "constructor") {
    return `constructor(${
      formatAbiParameterPrototypes(abiItem.inputs as Params)
    })`;
  } else if (abiItem.type === "fallback") return "fallback()" as Result;
  return "receive()" as Result;
}

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
