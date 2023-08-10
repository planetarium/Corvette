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
} from "abitype";
import type { Join } from "abitype/dist/types/types.d.ts";
// @deno-types="abitype/dist/types/regex.d.ts"
import { execTyped } from "abitype/dist/esm/regex.js";

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
