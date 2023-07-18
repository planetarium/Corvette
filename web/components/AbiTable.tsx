import type { AbiEvent } from "https://esm.sh/abitype@0.9.0";

interface Props {
  abi: AbiEvent;
}

export const AbiTable = ({ abi }: Props) => {
  return (
    <table class="table">
      <thead>
        <tr>
          <td>name</td>
          <td>type</td>
          <td>indexed</td>
        </tr>
      </thead>
      {abi.inputs.map((input) => (
        <tr>
          <td>{input.name || "(empty)"}</td>
          <td>
            {input.type} ({input.internalType})
          </td>
          <td>{String(input.indexed)}</td>
        </tr>
      ))}
    </table>
  );
};
