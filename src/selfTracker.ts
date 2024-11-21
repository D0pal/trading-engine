import { Connection, PublicKey, ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import loadConfig from "./loadConfig";
import chalk from "chalk";
import fs from "fs";
import axios from "axios";
import { fork } from 'child_process';
import path from 'path';

interface Config {
  rpcURL: string;
  wsURL: string;
  pubKey: string;
}

interface AfkBuy {
  mint: string;
  bondingCurve: string;
  associatedCurve: string;
  associatedTokenAccount: string;
  tokenAmount: number | null;
  tokenAmountLamports: string;
  devAddress: string;
}

async function selfTracker(): Promise<void> {
  const config: Config = await loadConfig();
  const rpc = config.rpcURL;
  const ws = config.wsURL;
  const myAddress = config.pubKey;

  console.log(chalk.green("Monitoring " + myAddress + " for new transactions..."));

  const connection = new Connection(rpc, { commitment: 'confirmed', wsEndpoint: ws });

  const trackMe = new PublicKey(myAddress);

  return new Promise((resolve, reject) => {
    connection.onLogs(
      trackMe,
      async ({ logs, err, signature }) => {
        if (err) {
          reject(err);
          return;
        }
        if (logs && logs.some(log => log.includes("Buy"))) {
          console.log(chalk.green("New transaction detected: " + signature));
          await fetchAccounts(signature, connection);
          resolve();
        }
      },
      "confirmed"
    );
  });
}

async function fetchAccounts(txId: string, connection: Connection): Promise<void> {
  const PUMP_PUBLIC_KEY = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

  let tx: ParsedTransactionWithMeta | null;
  try {
    tx = await connection.getParsedTransaction(txId, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
  } catch (error) {
    console.error(`Error fetching transaction: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (!tx || !tx.transaction) {
    console.log("Transaction not found or invalid format.");
    return;
  }

  let pumpInstruction: PartiallyDecodedInstruction | undefined;
  try {
    pumpInstruction = tx.transaction.message.instructions.find(ix =>
      'programId' in ix && ix.programId.toBase58() === PUMP_PUBLIC_KEY
    ) as PartiallyDecodedInstruction | undefined;
  } catch (error) {
    console.error("Error finding PUMP instruction:", error instanceof Error ? error.message : String(error));
    return;
  }

  if (!pumpInstruction || !('accounts' in pumpInstruction)) {
    console.log("No PUMP instruction found in the transaction.");
    return;
  }

  const accounts = pumpInstruction.accounts;

  if (!accounts || accounts.length < 6) {
    console.log("Insufficient accounts found in the PUMP instruction.");
    return;
  }

  let mint = accounts[2];
  let bCurve = accounts[3];
  let aCurve = accounts[4];
  let ata = accounts[5];

  const ca = mint.toBase58();
  const bondingCurve = bCurve.toBase58();
  const associatedCurve = aCurve.toBase58();
  const associatedTokenAccount = ata.toBase58();

  let tokenBalance;
  try {
    tokenBalance = await connection.getTokenAccountBalance(ata, 'confirmed');
  } catch (error) {
    console.error(`Error fetching token account balance: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const tokenAmountLamports = tokenBalance.value.amount;
  const tokenAmount = tokenBalance.value.uiAmount;

  // get dev address from pump.fun API
  const url = `https://frontend-api.pump.fun/coins/${ca}`;
  const response = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive'
    }
  });

  if (response.status !== 200) {
    console.log(`Error: ${response.status}`);
    return;
  } else {
    console.log(`Success: ${response.status}`);
  }

  const data = response.data;
  const devAddress = data.creator;

  const afkBuy: AfkBuy = {
    mint: ca,
    bondingCurve: bondingCurve,
    associatedCurve: associatedCurve,
    associatedTokenAccount: associatedTokenAccount,
    tokenAmount: tokenAmount,
    tokenAmountLamports: tokenAmountLamports,
    devAddress: devAddress
  };

  // Read the current contents of the mint.json file
  let currentData: AfkBuy[] = [];
  if (fs.existsSync('./mint.json')) {
    const fileData = fs.readFileSync('./mint.json', 'utf8');
    try {
      currentData = JSON.parse(fileData);
      if (!Array.isArray(currentData)) {
        currentData = [];
      }
    } catch (err) {
      currentData = [];
    }
  }
  // Append the new data
  currentData.push(afkBuy);

  // Write the updated contents back to the file
  fs.writeFileSync('./mint.json', JSON.stringify(currentData, null, 2));

  // Fork a new process for devTracker
  const child = fork(path.join(__dirname, 'devTracker.ts'), [devAddress], {
    execArgv: ['-r', 'ts-node/register']
  });

  child.on('message', (message) => {
    console.log(`Message from child: ${message}`);
  });

  child.on('error', (error) => {
    console.error(`Error from child: ${error}`);
  });

  child.on('exit', (code) => {
    console.log(`Child process exited with code ${code}`);
  });
}

selfTracker().catch(console.error);