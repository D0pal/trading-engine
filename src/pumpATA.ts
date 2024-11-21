import { PublicKey, Keypair } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import loadConfig from './loadConfig';
import bs58 from 'bs58';
import fs from 'fs';

async function createATA(mint: PublicKey) {
    try {
        const config = await loadConfig();
        const owner = new PublicKey(config.pubKey);
        const secret = config.privKey;
        const keypair = Keypair.fromSecretKey(bs58.decode(secret));

        // Get the associated token address
        const associatedToken = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const ata = associatedToken.toBase58();
        const ataIX = createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, associatedToken, owner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        return { ata, ataIX };
    } catch (error) {
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${(error as Error).message || error}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error; // Rethrow the error after logging it
    }
}

export default createATA;
