import { Connection, PublicKey, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { PUMP_PROGRAM_ID } from "./constants"
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import pumpIdl from "../pump-idl.json";
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js';
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import loadConfig from './loadConfig';
import axios from 'axios';
import fs from "fs";
import BN from "bn.js";

process.removeAllListeners('warning');
process.removeAllListeners('ExperimentalWarning');

// Pre-compute constants
const GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const FEE = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
const SYSTEM_PROG = new PublicKey("11111111111111111111111111111111");
const TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const EVENT_AUTH = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const TIP_ACCOUNT = new PublicKey("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5");

// Cache config
let cachedConfig: any = null;

async function getConfig() {
    if (!cachedConfig) {
        cachedConfig = await loadConfig();
    }
    return cachedConfig;
}

async function sellTheDump(ca: string) {
    const config = await getConfig();
    const { rpcURL: rpc, wsURL: ws, jitoTipAmount, privKey, pubKey, blockEngineURL, jitoTip } = config;

    const jitoTipAmountLamports = jitoTipAmount * 1e9;

    const connection = new Connection(rpc, {
        commitment: 'confirmed',
        wsEndpoint: ws
    });
    
    const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(privKey)));
    const wallet = new PublicKey(pubKey);
    const jitoTipKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(jitoTip)));

    const url = `https://frontend-api.pump.fun/coins/${ca}`;

    try {
        const response = await axios.get(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br',
                Connection: 'keep-alive'
            }
        });

        const { bonding_curve: bCurve, associated_bonding_curve: aCurve } = response.data;
        
        const mint = new PublicKey(ca);
        const bondingCurve = new PublicKey(bCurve);
        const aBondingCurve = new PublicKey(aCurve);

        const [tokenATA, tokenAcctBalance] = await Promise.all([
            connection.getTokenAccountsByOwner(wallet, { mint: mint }),
            connection.getTokenAccountBalance(new PublicKey((await connection.getTokenAccountsByOwner(wallet, { mint: mint })).value[0].pubkey))
        ]);

        const tokenAccountPubKey = tokenATA.value[0].pubkey;
        const sellAmount = tokenAcctBalance.value.amount;

        const pumpProgram = new Program(pumpIdl as Idl, PUMP_PROGRAM_ID, new AnchorProvider(connection, new NodeWallet(payer), AnchorProvider.defaultOptions()));
        
        const [sellIX, blockhashObj] = await Promise.all([
            pumpProgram.methods.sell(
                new BN(sellAmount),
                new BN(0)
            ).accounts({
                global: GLOBAL,
                feeRecipient: FEE,
                mint: mint,
                bondingCurve: bondingCurve,
                associatedBondingCurve: aBondingCurve,
                associatedUser: new PublicKey(tokenAccountPubKey),
                user: wallet,
                systemProgram: SYSTEM_PROG,
                tokenProgram: TOKEN_PROG,
                rent: RENT,
                eventAuthority: EVENT_AUTH,
                program: PUMP,
            }).instruction(),
            connection.getLatestBlockhash('finalized')
        ]);

        const tipIX = SystemProgram.transfer({
            fromPubkey: jitoTipKeypair.publicKey,
            toPubkey: TIP_ACCOUNT,
            lamports: jitoTipAmountLamports
        });

        const messageV0 = new TransactionMessage({
            payerKey: payer.publicKey,
            instructions: [sellIX, tipIX],
            recentBlockhash: blockhashObj.blockhash
        }).compileToV0Message();

        const fullTX = new VersionedTransaction(messageV0);
        fullTX.sign([payer, jitoTipKeypair]);

        const search = searcherClient(blockEngineURL);
        const bund = new Bundle([], 5);
        bund.addTransactions(fullTX);

        const sentBundle = await search.sendBundle(bund);
        console.log("Sent Sell Bundle: ", sentBundle);
        console.log(`Confirm Bundle Manually (JITO): https://explorer.jito.wtf/bundle/${sentBundle}`);
        console.log("\n");
    } catch (error) {
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${(error as Error).message || error}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error;
    }
}

export default sellTheDump;