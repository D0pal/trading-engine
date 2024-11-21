import {
  Connection,
  PublicKey,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import NodeCache from "node-cache";
import chalk from "chalk";
import { performance } from "perf_hooks";
import { afkBlox } from "./afkBuy";
import loadConfig from "./loadConfig";
import loadFilters from "./loadFilters";
import getAge from "./getWalletAge";
import { parseMetadata, Metadata } from "./parseMetadata";

const cache = new NodeCache({ stdTTL: 600 });
let connection: Connection | null = null;
let filters: any = null;
let config: any = null;
let metaplex: Metaplex | null = null;

interface Holder {
  label: string;
  amount: string;
  pct: string;
}

async function initialize() {
  if (!config) {
    config = await loadConfig();
    connection = new Connection(config.rpcURL, {
      commitment: "confirmed",
      wsEndpoint: config.wsURL,
    });
    metaplex = Metaplex.make(connection);
  }
  if (!filters) {
    filters = await loadFilters();
  }
}

async function monitorAFK(): Promise<void> {
  await initialize();
  if (!connection) throw new Error("Connection not initialized");

  const pump = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

  console.log("Monitoring for new pumps...");

  return new Promise((resolve, reject) => {
    connection!.onLogs(
      pump,
      async (result) => {
        try {
          if (result.err) {
            return; // Silently ignore transaction errors
          }

          const { logs, signature } = result;

          if (logs && logs.some((log) => log.includes("InitializeMint2"))) {
            const detectionTime = Date.now();
            await fetchPumpAccounts(signature, detectionTime);
          }
        } catch (error) {
          // Silently ignore any other errors
        }
      },
      "confirmed"
    );
  });
}

async function fetchPumpAccounts(txId: string, detectionTime: number) {
  if (!connection) throw new Error("Connection not initialized");
  const startTime = performance.now();

  const tx = await connection.getParsedTransaction(txId, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx || !tx.transaction.message.instructions.length) return;

  const pumpInstruction = tx.transaction.message.instructions.find(
    (ix) =>
      "programId" in ix &&
      ix.programId.toBase58() === "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
  ) as PartiallyDecodedInstruction | undefined;

  if (
    !pumpInstruction ||
    !("accounts" in pumpInstruction) ||
    pumpInstruction.accounts.length < 8
  )
    return;

  const [mint, , bondingCurve, aBondCurve, , , , creator] =
    pumpInstruction.accounts;

  // Check if token ends in 'pump'
  if (!mint.toBase58().toLowerCase().endsWith("pump")) return;

  console.log(chalk.greenBright(`New Token Found: ${mint.toBase58()}`));
  console.log(chalk.blueBright("Checking Filters..."));

  const devWallet = creator.toBase58();

  const [metadata, topHolders, devSOLBalance, devAge] = await Promise.all([
    parseMetadata(pumpInstruction),
    getHolderCount(mint, aBondCurve, creator),
    getDevSOLBalance(creator),
    getAge(devWallet),
  ]);

  console.log({ metadata, topHolders, devSOLBalance, devAge });

  if (!metadata || !topHolders || !devSOLBalance || devAge === null) {
    console.log("Error fetching metadata or holders. Skipping...");
    return;
  }

  const bondingCurvePct =
    topHolders.find((holder) => holder.label === "Bonding Curve")?.pct || "0";
  const devPct =
    topHolders.find((holder) => holder.label === "Creator")?.pct || "0";

  const isBondingCurveConditionMet = Number(bondingCurvePct) >= 80;
  const isDevConditionMet = Number(devPct) < 20;

  let amount: number = 0;
  let maxSolCost: number = 0;
  if (tx.meta && tx.meta.innerInstructions) {
    const innerInstructions = tx.meta.innerInstructions
      .map((ix) => ix.instructions)
      .flat();
    const systemInstructions = innerInstructions.filter(
      (instr) =>
        "program" in instr &&
        instr.program === "system" &&
        "parsed" in instr &&
        instr.parsed.type === "transfer"
    );

    const splInstructions = innerInstructions.filter(
      (instr) =>
        "program" in instr &&
        instr.program === "spl-token" &&
        "parsed" in instr &&
        instr.parsed.type === "transfer"
    );

    if (systemInstructions.length > 0 && splInstructions.length > 0) {
      const solInstruction = systemInstructions[1];
      const splInstruction = splInstructions[0];

      if ("parsed" in solInstruction && "parsed" in splInstruction) {
        const parsedSOLObject = solInstruction.parsed;
        const parsedTokenObject = splInstruction.parsed;

        if (
          "info" in parsedSOLObject &&
          "lamports" in parsedSOLObject.info &&
          typeof parsedSOLObject.info.lamports === "number"
        ) {
          maxSolCost = parsedSOLObject.info.lamports / 1e9;
        }

        if (
          "info" in parsedTokenObject &&
          "amount" in parsedTokenObject.info &&
          typeof parsedTokenObject.info.amount === "string"
        ) {
          amount = parsedTokenObject.info.amount / 1e6;
        }
      }
    }
  }

  await checkBuyConditions(
    isBondingCurveConditionMet,
    isDevConditionMet,
    metadata,
    mint,
    bondingCurve,
    aBondCurve,
    creator,
    Number(devPct),
    maxSolCost,
    devSOLBalance,
    devAge,
    devWallet,
    detectionTime
  );

  const endTime = performance.now();
  console.log(`Processing time: ${endTime - startTime} ms`);
}

async function getHolderCount(
  mint: PublicKey,
  aBondCurve: PublicKey,
  creator: PublicKey
): Promise<Holder[]> {
  if (!connection) throw new Error("Connection not initialized");
  const cacheKey = `holders_${mint.toBase58()}`;
  const cachedHolders = cache.get<Holder[]>(cacheKey);
  if (cachedHolders) {
    return cachedHolders;
  }

  try {
    const [tokenAccounts, holders, totalSupply] = await Promise.all([
      connection.getTokenAccountsByOwner(creator, { mint }, "confirmed"),
      connection.getTokenLargestAccounts(mint, "confirmed"),
      connection.getTokenSupply(mint),
    ]);

    const devATA = tokenAccounts.value[0]?.pubkey || null;
    const supply = BigInt(totalSupply.value.amount);

    const result = holders.value
      .map((holder) => {
        const address = holder.address.toBase58();
        const amount = holder.amount;
        const pct = (
          (BigInt(amount) * BigInt(10000)) /
          supply /
          BigInt(100)
        ).toString();
        let label: string;

        if (address === aBondCurve.toBase58()) {
          label = "Bonding Curve";
        } else if (devATA && address === devATA.toBase58()) {
          label = "Creator";
        } else {
          label = "Holder";
        }

        return { label, amount, pct };
      })
      .slice(0, 10);

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.log("Error getting holder count:", error);
    return [];
  }
}

async function getDevSOLBalance(creator: PublicKey): Promise<number> {
  if (!connection) throw new Error("Connection not initialized");
  const cacheKey = `devBalance_${creator.toBase58()}`;
  const cachedBalance = cache.get<number>(cacheKey);
  if (cachedBalance !== undefined) {
    return cachedBalance;
  }

  const balance = await connection.getBalance(creator, "confirmed");
  const solBalance = balance / 1e9;
  cache.set(cacheKey, solBalance);
  return solBalance;
}

async function checkBuyConditions(
  isBondingCurveConditionMet: boolean,
  isDevConditionMet: boolean,
  metadata: Metadata,
  mint: PublicKey,
  bondingCurve: PublicKey,
  aBondCurve: PublicKey,
  creator: PublicKey,
  devPct: number,
  maxSolCost: number,
  devSOLBalance: number,
  devAge: number,
  devWallet: string,
  detectionTime: number
) {
  const currentTime = Date.now();
  if (currentTime - detectionTime > 10000) {
    console.log(
      "More than 10 seconds has passed since detection. Skipping the buy operation."
    );
    return;
  }

  // Check banned names and creators
  if (filters.bannedNames.includes(metadata.name)) {
    console.log("Banned token name: ", metadata.name);
    return;
  }

  if (filters.bannedCreators.includes(devWallet)) {
    console.log("Banned creator: ", devWallet);
    return;
  }

  // Check dev buy amount, percentage, and balance
  if (
    maxSolCost < filters.minDevBuy ||
    maxSolCost > filters.maxDevBuy ||
    devPct < filters.minDevPct ||
    devPct > filters.maxDevPct ||
    devSOLBalance < filters.minDevBal ||
    devSOLBalance > filters.maxDevBal
  ) {
    console.log(
      `Invalid dev conditions: maxSolCost: ${maxSolCost}, devPct: ${devPct}%, devSOLBalance: ${devSOLBalance.toFixed(
        4
      )} SOL`
    );
    return;
  }

  // Check social requirements
  const {
    twitter: twitterRequired,
    telegram: telegramRequired,
    website: websiteRequired,
  } = filters;
  if (
    (twitterRequired === "T" && !metadata.twitter) ||
    (websiteRequired === "T" && !metadata.website) ||
    (telegramRequired === "T" && !metadata.telegram)
  ) {
    console.log(`Missing required social link(s) for token: ${metadata.name}`);
    return;
  }

  // Check bonding curve and dev conditions
  if (!isBondingCurveConditionMet || !isDevConditionMet) {
    console.log("Bonding Curve or Dev condition not met.");
    return;
  }

  //Check dev wallet age
  if (devAge && devAge < filters.age) {
    console.log(`Dev wallet is too young. Age: ${devAge} days`);
    return;
  }

  // If all conditions pass, buy the pump
  console.log("All conditions met. Buying the pump...");
  await afkBlox(mint, bondingCurve, aBondCurve);
}

export default monitorAFK;
