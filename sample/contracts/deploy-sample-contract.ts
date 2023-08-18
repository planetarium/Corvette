import Account from "https://deno.land/x/web3@v0.11.1/packages/web3-eth-accounts/src/index.js";

import {
  CallExecutionError,
  type Chain,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatGwei,
  http,
} from "npm:viem";
import { privateKeyToAccount } from "npm:viem/accounts";

import {
  getRelativeScriptPath,
  importESOrJson,
  normalizeImports,
} from "../../utils/moduleUtils.ts";

const deterministicDeployerAddress =
  "0x7A0D94F55792C434d74a40883C6ed8545E406D12";
const bytecode = // v0.8.18, optimizer runs: 10_000_000
  "0x60806040526000805534801561001457600080fd5b5061035c806100246000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80637442e68f1461003b5780637cd4b95014610045575b600080fd5b61004361004d565b005b6100436100eb565b600061005761013d565b600080549192503391602a918061006d8361027e565b909155507f0b291f5ed3dd7dd8fbb5bf2bfe7cc6b1c0910ee877caab99b6db1c95e107073c843061009f6002836102e5565b6040805193845273ffffffffffffffffffffffffffffffffffffffff909216602084015215908201524160608201819052316080820152333160a082015260c00160405180910390a450565b60006100f561013d565b600080549192503391602a918061010b8361027e565b909155507f174ad6f40a94f5d83762a22463485159a77e605aac63e75b0eb2c2d634771f39843061009f6002836102e5565b6040517fffffffffffffffffffffffffffffffffffffffff0000000000000000000000003360601b166020820152600090439042906034016040516020818303038152906040528051906020012060001c61019891906102f9565b6040517fffffffffffffffffffffffffffffffffffffffff0000000000000000000000004160601b166020820152459042906034016040516020818303038152906040528051906020012060001c6101f091906102f9565b6101fa444261030d565b610204919061030d565b61020e919061030d565b610218919061030d565b610222919061030d565b60405160200161023491815260200190565b60405160208183030381529060405280519060200120905090565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036102af576102af61024f565b5060010190565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b6000826102f4576102f46102b6565b500690565b600082610308576103086102b6565b500490565b808201808211156103205761032061024f565b9291505056fea26469706673582212207024a0861164c57ed7dccfd67f5740908ae49a243adcfad5913851bb76d47cd664736f6c63430008120033";

async function main() {
  if (Deno.args.length != 3) {
    const filename = getRelativeScriptPath(import.meta.url);
    console.log(
      `usage: ${
        (filename.endsWith(".ts")
          ? "deno run --allow-read --allow-net --allow-cwd "
          : "") +
        filename
      } <URL or relative path of chain definition> <path of web3 keystore v3> <keystore password>`,
    );
    Deno.exit();
  }

  const chain = await importESOrJson(Deno.args[0], {
    baseDir: Deno.cwd(),
  }) as Chain;
  const keystore = (await import(normalizeImports(Deno.args[1]), {
    assert: { type: "json" },
  }))
    .default;
  const account = privateKeyToAccount(
    Account.prototype.decrypt(keystore, Deno.args[2]).privateKey,
  );
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  let data;
  try {
    data = await publicClient.call({
      to: deterministicDeployerAddress,
      data: bytecode,
    });
  } catch (e) {
    if (!(e instanceof CallExecutionError)) throw e;
    console.log(
      "Contract already deterministically deployed or node does not support contract.",
    );
    Deno.exit();
  }

  if (data.data == undefined) {
    console.log(
      "Deterministic deployer not deployed at 0x7A0D94F55792C434d74a40883C6ed8545E406D12.",
      "For deployment information, refer to: https://github.com/Zoltu/deterministic-deployment-proxy",
    );
    Deno.exit();
  }

  console.log(
    `Contract to be deployed at: ${
      chain.blockExplorers != null
        ? chain.blockExplorers.default.url + "/address/"
        : ""
    }${data.data}`,
  );

  const gasEstimate = await publicClient.estimateGas({
    account,
    to: deterministicDeployerAddress,
    data: bytecode,
  });
  const gasPrice = await publicClient.getGasPrice();
  console.log(
    `Gas: ${formatEther(gasEstimate * gasPrice)} ETH (${gasEstimate} * ${
      formatGwei(gasPrice)
    } gwei)`,
  );
  const confirmed = confirm("Proceed?");

  if (confirmed) {
    const hash = await walletClient.sendTransaction({
      to: deterministicDeployerAddress,
      gas: gasEstimate,
      data: bytecode,
    });
    console.log(
      `Tx hash: ${
        chain.blockExplorers != null
          ? chain.blockExplorers.default.url + "/tx/"
          : ""
      }${hash}`,
    );
  } else {
    console.log("Aborting.");
  }
}

if (import.meta.main) await main();
