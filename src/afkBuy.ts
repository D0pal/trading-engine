import { Connection, PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { PUMP_PROGRAM_ID } from "./constants"
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import pumpIdl from "../pump-idl.json";
import createATA from "./pumpATA";
import loadConfig from './loadConfig';
import calculateBuyAmount from './pumpCalcBuy';
import axios from 'axios';
import BN from "bn.js";
import chalk from 'chalk';

// Pre-compute constants
const GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const FEE = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
const SYSTEM_PROG = new PublicKey("11111111111111111111111111111111");
const TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const EVENT_AUTH = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const TRADER_API_TIP_WALLET = new PublicKey("HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY");

// Cache config
let cachedConfig: any = null;

async function getConfig() {
    if (!cachedConfig) {
        cachedConfig = await loadConfig();
    }
    return cachedConfig;
}

async function afkBlox(ca: PublicKey, bondingCurve: PublicKey, aBondingCurve: PublicKey) {
    const config = await getConfig();
    const { rpcURL: rpc, wsURL: ws, computeUnit, computeLimit, apiKey, buyAmount, jitoTipAmount: tipAmount, privKey, pubKey } = config;
    
    const buyAmountLamports = buyAmount * 1e9;
    const tipAmountLamports = tipAmount * LAMPORTS_PER_SOL;

    const connection = new Connection(rpc, { commitment: 'confirmed', wsEndpoint: ws });
    const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(privKey)));
    const wallet = new PublicKey(pubKey);

    // Parallel execution of independent operations
    const [tokenAccountShit, amountData, latestBlockhash] = await Promise.all([
        createATA(ca),
        calculateBuyAmount(bondingCurve.toBase58(), buyAmountLamports),
        connection.getLatestBlockhash()
    ]);

    const { ata, ataIX } = tokenAccountShit;

    if (amountData <= 0) {
        throw new Error("calculateBuyAmount returned an invalid value");
    }

    const amount = new BN(Math.floor(amountData * 1e6) - 1);
    const slippage = 0.15;
    const maxSolCost = new BN(Math.floor(buyAmountLamports * (1 + slippage)));

    const ancConnection = new Connection(rpc, { commitment: 'confirmed' });
    const pumpProgram = new Program(pumpIdl as Idl, PUMP_PROGRAM_ID, new AnchorProvider(ancConnection, new NodeWallet(payer), AnchorProvider.defaultOptions()));

    const buyIx = await pumpProgram.methods.buy(amount, maxSolCost)
        .accounts({
            global: GLOBAL,
            feeRecipient: FEE,
            mint: ca,
            bondingCurve: bondingCurve,
            associatedBondingCurve: aBondingCurve,
            associatedUser: new PublicKey(ata),
            user: wallet,
            systemProgram: SYSTEM_PROG,
            tokenProgram: TOKEN_PROG,
            rent: RENT,
            eventAuthority: EVENT_AUTH,
            program: PUMP,
        }).instruction();

    const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnit });
    const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: computeLimit });

    const memoIX = new TransactionInstruction({
        keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from("Powered by bloXroute Trader Api", "utf-8"),
        programId: new PublicKey("HQ2UUt18uJqKaQFJhgV9zaTdQxUZjNrsKFgoEDquBkcx"),
    });

    const tipIX = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: TRADER_API_TIP_WALLET,
        lamports: tipAmountLamports,
    });

    const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        instructions: [computePriceIx, computeLimitIx, ataIX, buyIx, memoIX, tipIX],
        recentBlockhash: latestBlockhash.blockhash
    }).compileToV0Message();

    const fullTX = new VersionedTransaction(messageV0);
    fullTX.sign([payer]);

    const txToSend = fullTX.serialize();
    const txbase64Payload = Buffer.from(txToSend).toString('base64');

    const apiEP = "https://ny.solana.dex.blxrbdn.com/api/v2/submit";

    const body = {
        transaction: { content: txbase64Payload, isCleanup: false },
        frontRunningProtection: false,
        useStakedRPCs: true
    };

    try {
        const sendTX = await axios.post(apiEP, body, { headers: { 'Authorization': apiKey } });
        console.timeEnd("buy");

        const txid = sendTX.data.signature;
        console.log(chalk.greenBright(`TXID: https://solscan.io/tx/${txid}\n`));
    } catch (error) {
        console.error("Error sending transaction:", error);
    }
}

export { afkBlox };