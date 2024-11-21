import { Connection, PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { PUMP_PROGRAM_ID } from "./constants"
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import pumpIdl from "../pump-idl.json";
import loadConfig from './loadConfig';
import axios from 'axios';
import BN from "bn.js";

process.removeAllListeners('warning');
process.removeAllListeners('ExperimentalWarning');


async function devSoldJEEET(mint: PublicKey, bCurve: PublicKey, aCurve: PublicKey, ata: string, sellAmount: number, sellAmountLamports: number) {
    const config = await loadConfig();
    const computeUnit = config.computeUnit;
    const computeLimit = config.computeLimit;
    const apiKey = config.apiKey;
    const rpc = config.rpcURL;
    const ws = config.wsURL;

    const connection = new Connection(rpc, {
        commitment: 'confirmed',
        wsEndpoint: ws
    });

    const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(config.privKey)));
    const wallet = new PublicKey(config.pubKey);

    const tokenAccountPubKey = ata;

    const GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
    const FEE = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
    const SYSTEM_PROG = new PublicKey("11111111111111111111111111111111");
    const TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const EVENT_AUTH = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
    const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
    const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

    //initializing connection, keypair and program 
    const ancConnection = new Connection(rpc, { commitment: 'confirmed' });
    const pumpProgram = new Program(pumpIdl as Idl, PUMP_PROGRAM_ID, new AnchorProvider(ancConnection, new NodeWallet(payer), AnchorProvider.defaultOptions()));
    

    const sellIX = await pumpProgram.methods.sell(
        new BN(sellAmountLamports),
        new BN(0)
    ).accounts({
        global: GLOBAL,
        feeRecipient: FEE,
        mint: mint,
        bondingCurve: bCurve,
        associatedBondingCurve: aCurve,
        associatedUser: new PublicKey(tokenAccountPubKey),
        user: wallet,
        systemProgram: SYSTEM_PROG,
        tokenProgram: TOKEN_PROG,
        rent: RENT,
        eventAuthority: EVENT_AUTH,
        program: PUMP,
    }).instruction();

    const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnit });
    const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: computeLimit });

    const message = "Powered by bloXroute Trader Api";
    const memoIX = new TransactionInstruction({
        keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from(message, "utf-8"),
        programId: new PublicKey("HQ2UUt18uJqKaQFJhgV9zaTdQxUZjNrsKFgoEDquBkcx"),
    });

    const TRADER_API_TIP_WALLET = new PublicKey("HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY");
    const tipIX = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: TRADER_API_TIP_WALLET,
        lamports: 5000000,
    });

    const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        instructions: [computePriceIx, computeLimitIx, sellIX, memoIX, tipIX],
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash
    }).compileToV0Message();

    const fullTX = new VersionedTransaction(messageV0);
    fullTX.sign([payer]);

    const txToSend = fullTX.serialize();
    const txbase64Payload = Buffer.from(txToSend).toString('base64');

    const apiEP = "https://ny.solana.dex.blxrbdn.com/api/v2/submit";

    const hdr = {
        'Authorization': apiKey
    };

    const body = {
        transaction: { content: txbase64Payload, isCleanup: false },
        frontRunningProtection: false,
        useStakedRPCs: true
    };

    try {
        const sendTX = await axios.post(apiEP, body, { headers: hdr });
        console.log("TX Sent At: ", new Date().toUTCString());

        const txData = sendTX.data;
        const txid = txData.signature;

        console.log(`TXID: https://solscan.io/tx/${txid}`);

        // get the status of the transaction
        const statusEP = `https://ny.solana.dex.blxrbdn.com/api/v2/transaction?${txid}`;
        const status = await axios.get(statusEP, { headers: hdr });

        console.log("TX Status: ", status?.data?.status);

        if (status?.data?.status === "success") {
            console.log("Transaction Confirmed");
        } else {
            // retry the transaction
            console.log("Transaction failed, retrying...");
            await devSoldJEEET(mint, bCurve, aCurve, ata, sellAmount, sellAmountLamports);
        }

    } catch (error) {
        console.error("Error sending transaction:", error);
    }
}

export default devSoldJEEET;