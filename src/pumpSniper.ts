import { Connection, PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, PartiallyDecodedInstruction } from '@solana/web3.js';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import createATA from "./pumpATA";
import loadConfig from './loadConfig';
import calculateBuyAmount from './pumpCalcBuy';
import bs58 from 'bs58';
import fs from 'fs';

async function monitorPump() {
    const config = await loadConfig();
    const rpc = config.rpcURL;
    const ws = config.wsURL;
    const PUMP_PUBLIC_KEY = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    const pump = new PublicKey(PUMP_PUBLIC_KEY);
    const connection = new Connection(rpc, {
        commitment: 'confirmed',
        wsEndpoint: ws
    });
    console.log("Monitoring for new pumps...");

    // Subscribe and save the subscription ID
    const subscription = connection.onLogs(pump, async ({
        logs,
        err,
        signature
    }) => {
        if (err) return;
        if (logs && logs.some(log => log.includes("InitializeMint2"))) {
            //console.log(`https://solscan.io/tx/${signature}`);
            connection.removeOnLogsListener(subscription);
            console.log("Unsubscribed from logs after finding the pool.");
            await fetchPumpAccounts(signature);
        }
    }, "confirmed");
}

interface Config {
    rpcURL: string;
    wsURL: string;
    jitoTipAmount: number;
    privKey: string;
    pubKey: string;
    buyAmount: number;
    blockEngineURL: string;
    jitoTip: string;
}

async function fetchPumpAccounts(txId: string): Promise<void> {
    const config: Config = await loadConfig();
    const rpc = config.rpcURL;
    const ws = config.wsURL;
    
    let jitoTipAmount = config.jitoTipAmount * 10 ** 9;

    const connection = new Connection(rpc, {
        commitment: 'confirmed',
        wsEndpoint: ws
    });
    const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(config.privKey)));
    const wallet = new PublicKey(config.pubKey);

    let buyAmount = config.buyAmount;

    const blockEngineURL = config.blockEngineURL;
    const jitoTip = Keypair.fromSecretKey(new Uint8Array(bs58.decode(config.jitoTip)));

    const PUMP_PUBLIC_KEY = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    const pump = new PublicKey(PUMP_PUBLIC_KEY);

    const tx = await connection.getParsedTransaction(
        txId,
        {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        }
    );

    if (!tx) {
        console.log("Transaction not found.");
        return;
    }

    const pumpInstruction = tx.transaction.message.instructions.find(
        ix => 'programId' in ix && ix.programId.toBase58() === PUMP_PUBLIC_KEY
    ) as PartiallyDecodedInstruction | undefined;

    if (!pumpInstruction || !('accounts' in pumpInstruction) || pumpInstruction.accounts.length < 4) {
        console.log("Required accounts not found in the transaction.");
        return;
    }

    const mint = pumpInstruction.accounts[0];
    const bondingCurve = pumpInstruction.accounts[2];
    const aBondCurve = pumpInstruction.accounts[3];

    console.log("Found New Token:", mint.toBase58() + "\n");

    const decimals = 9;

    const pumpDecimals = 6;
    const buyAmountLamports = buyAmount * 10 ** decimals;

    // get ATA instructions
    const tokenAccount = await createATA(mint);
    const tokenAccountPubKey = tokenAccount.ata;
    const ataIx = tokenAccount.ataIX;

    const SYSTEM_PROGAM_ID = "11111111111111111111111111111111";
    const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const SYSVAR_RENT_ID = "SysvarRent111111111111111111111111111111111";
    const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
    const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
    const idkThisOne = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

    const account1 = global;
    const account2 = feeRecipient; // Writeable
    const account3 = mint;
    const account4 = bondingCurve; // Writeable
    const account5 = aBondCurve; // Writeable
    const account6 = new PublicKey(tokenAccountPubKey); // Writeable
    const account7 = new PublicKey(wallet); // Writeable & Signer & Fee Payer
    const account8 = new PublicKey(SYSTEM_PROGAM_ID); // Program
    const account9 = new PublicKey(TOKEN_PROGRAM_ID); // Program
    const account10 = new PublicKey(SYSVAR_RENT_ID);
    const account11 = idkThisOne;
    const account12 = pump;

    function encodeU64(value: number | bigint): Buffer {
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(BigInt(value), 0);
        return buffer;
    }

    function encodeTransaction(amount: number | bigint, maxSolCost: number | bigint): Buffer {
        const opcode = Buffer.from([0x66]); // Opcode for 'buy' instruction
        const constantPrefix = Buffer.from('063d1201daebea', 'hex'); // The constant part after opcode

        // Encoding the amount and maxSolCost
        const encodedAmount = encodeU64(amount);
        const encodedMaxSolCost = encodeU64(maxSolCost);

        // Concatenating all parts: opcode, constantPrefix, encodedAmount, encodedMaxSolCost
        return Buffer.concat([opcode, constantPrefix, encodedAmount, encodedMaxSolCost]);
    }

    // Example usage:
    const amountData = await calculateBuyAmount(bondingCurve.toBase58(), buyAmountLamports);
    let amount = Math.floor(amountData * 10 ** pumpDecimals);
    const maxSolCost = buyAmountLamports + buyAmountLamports * 0.15;

    const transactionBuffer = encodeTransaction(amount, maxSolCost);

    const swapIn = new TransactionInstruction({
        programId: pump,
        keys: [
            { pubkey: account1, isSigner: false, isWritable: false },
            { pubkey: account2, isSigner: false, isWritable: true },
            { pubkey: account3, isSigner: false, isWritable: false },
            { pubkey: account4, isSigner: false, isWritable: true },
            { pubkey: account5, isSigner: false, isWritable: true },
            { pubkey: account6, isSigner: false, isWritable: true },
            { pubkey: account7, isSigner: true, isWritable: true },
            { pubkey: account8, isSigner: false, isWritable: false },
            { pubkey: account9, isSigner: false, isWritable: false },
            { pubkey: account10, isSigner: false, isWritable: false },
            { pubkey: account11, isSigner: false, isWritable: false },
            { pubkey: account12, isSigner: false, isWritable: false }
        ],
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
        console.log("Sent Bundle: ", sentBundle);
        console.log(`Confirm Bundle Manually (JITO): https://explorer.jito.wtf/bundle/${sentBundle}`);
        console.log("\n");
        await monitorPump();
    
    } catch (error) {
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${error instanceof Error ? error.message : String(error)}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        await monitorPump(); // Retry if error
    }
}
export default monitorPump;