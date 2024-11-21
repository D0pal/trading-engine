import { Connection, PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import createATA from "./pumpATA";
import loadConfig from './loadConfig';
import bs58 from 'bs58';
import calculateBuyAmount from './pumpCalcBuy';
import axios from 'axios';
import fs from 'fs';

async function buyThePump(ca: string) {
  console.time("pump");
  const config = await loadConfig();

  const rpc = config.rpcURL;
  const ws = config.wsURL;

  const connection = new Connection(rpc, {
    commitment: 'confirmed',
    wsEndpoint: ws
  });
  const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(config.privKey)));
  const wallet = new PublicKey(config.pubKey);

  let buyAmount = config.buyAmount;
  const blockEngineURL = config.blockEngineURL;

  const jitoTip = Keypair.fromSecretKey(new Uint8Array(bs58.decode(config.jitoTip)));

  const jitoTipAmount = config.jitoTipAmount * 1e9;

  const PUMP_PUBLIC_KEY = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
  const pump = new PublicKey(PUMP_PUBLIC_KEY);

  const url = `https://frontend-api.pump.fun/coins/${ca}`;

  const response = await axios.get(url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive'
      }
    }
  );

  if (response.status !== 200) {
    console.log(`Error: ${response.status}`);
    return;
  } else {
    console.log(`Success: ${response.status}`);
  }

  const data = response.data;
  const bCurve = data.bonding_curve;
  const aCurve = data.associated_bonding_curve;

  const mint = new PublicKey(ca);
  const bondingCurve = new PublicKey(bCurve);
  const aBondingCurve = new PublicKey(aCurve);

  const decimals = 9;
  const pumpDecimals = 6;
  const buyAmountLamports = buyAmount * 10 ** decimals;
  console.log(buyAmountLamports);

  // get ATA instructions
  const tokenAccount = await createATA(mint);
  const tokenAccountPubKey = tokenAccount.ata;
  console.log(tokenAccountPubKey);
  const ataIx = tokenAccount.ataIX;

  const SYSTEM_PROGAM_ID = "11111111111111111111111111111111";
  const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const SYSVAR_RENT_ID = "SysvarRent111111111111111111111111111111111";
  const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
  const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
  const idkThisOne = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1")

  const account1 = global;
  const account2 = feeRecipient; // Writeable
  const account3 = mint;
  const account4 = bondingCurve // Writeable
  const account5 = aBondingCurve // Writeable
  const account6 = new PublicKey(tokenAccountPubKey); // Writeable
  const account7 = new PublicKey(wallet); // Writeable & Signer & Fee Payer
  const account8 = new PublicKey(SYSTEM_PROGAM_ID); // Program
  const account9 = new PublicKey(TOKEN_PROGRAM_ID); // Program
  const account10 = new PublicKey(SYSVAR_RENT_ID);
  const account11 = idkThisOne;
  const account12 = pump;

  function encodeU64(value: number) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value), 0);
    return buffer;
  }

  function encodeTransaction(amount: number, maxSolCost: number) {
    const opcode = Buffer.from([0x66]); // Opcode for 'buy' instruction
    const constantPrefix = Buffer.from('063d1201daebea', 'hex'); // The constant part after opcode

    // Encoding the amount and maxSolCost
    const encodedAmount = encodeU64(amount);
    const encodedMaxSolCost = encodeU64(maxSolCost);

    // Concatenating all parts: opcode, constantPrefix, encodedAmount, encodedMaxSolCost
    const encodedData = Buffer.concat([opcode, constantPrefix, encodedAmount, encodedMaxSolCost]);
    return encodedData;
  }

  // Example usage:
  const amountData = await calculateBuyAmount(bondingCurve.toBase58(), buyAmountLamports);
  let amount = amountData * 10 ** pumpDecimals;
  amount = parseInt(amount.toFixed(0), 10);

  const maxSolCost = buyAmountLamports + buyAmountLamports * 0.15;
  const transactionBuffer = encodeTransaction(amount, maxSolCost);
  const swapIn = new TransactionInstruction({
    programId: pump,
    keys: [{
      pubkey: account1,
      isSigner: false,
      isWritable: false
    }, {
      pubkey: account2,
      isSigner: false,
      isWritable: true
    }, {
      pubkey: account3,
      isSigner: false,
      isWritable: false
    }, {
      pubkey: account4,
      isSigner: false,
      isWritable: true
    }, {
      pubkey: account5,
      isSigner: false,
      isWritable: true
    }, {
      pubkey: account6,
      isSigner: false,
      isWritable: true
    }, {
      pubkey: account7,
      isSigner: true,
      isWritable: true,
    }, {
      pubkey: account8,
      isSigner: false,
      isWritable: false
    }, {
      pubkey: account9,
      isSigner: false,
      isWritable: false
    }, {
      pubkey: account10,
      isSigner: false,
      isWritable: false
    }, {
      pubkey: account11,
      isSigner: false,
      isWritable: false
    },
    {
      pubkey: account12,
      isSigner: false,
      isWritable: false
    }],
    data: transactionBuffer
  });

  const search = searcherClient(blockEngineURL);

  const tipAccount = new PublicKey("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5");

  const tipIX = SystemProgram.transfer({
    fromPubkey: jitoTip.publicKey,
    toPubkey: tipAccount,
    lamports: jitoTipAmount
  });

  const blockhashObj = await connection.getLatestBlockhash('finalized');
  const recentBlockhash = blockhashObj.blockhash;

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    instructions: [ataIx, swapIn, tipIX],
    recentBlockhash: recentBlockhash
  }).compileToV0Message();
  const fullTX = new VersionedTransaction(messageV0);

  fullTX.sign([payer, jitoTip]);

  try {
    const bund = new Bundle([], 5);
    bund.addTransactions(fullTX);

    const sentBundle = await search.sendBundle(bund);
    console.log("TX Sent At: ", new Date().toUTCString());
    console.log("Sent Bundle: ", sentBundle);
    console.log(`Confirm Bundle Manually (JITO): https://explorer.jito.wtf/bundle/${sentBundle}`);
    console.log("\n");
  } catch (error) {
    const logFilePath = "./logs.txt";
    const errorMessage = `Error occurred: ${(error as Error).message || error}\n`;
    fs.appendFileSync(logFilePath, errorMessage);
    console.log("An error occurred, check logs.txt for more information.");
    throw error; // Rethrow the error after logging it
  }
}
export default buyThePump;