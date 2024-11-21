import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import loadConfig from './loadConfig';
import calculateSellAmount from './pumpCalcSell';
import fs from "fs";
import { getBondingCurve } from './getKeys';


interface TokenData {
    CA: string;
    balance: string;
}

async function fetchTokens(wallet: string): Promise<TokenData[]> {
    const config = await loadConfig();
    const rpc = config.rpcURL;
    const ws = config.wsURL;

    const connection = new Connection(rpc, {
        commitment: 'confirmed',
        wsEndpoint: ws
    });

    const filters = [
        {
            dataSize: 165,    //size of account (bytes)
        },
        {
            memcmp: {
                offset: 32,     //location of our query in the account (bytes)
                bytes: wallet,  //our search criteria, a base58 encoded string
            },
        }
    ];

    const accounts = await connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        { filters: filters }
    );

    let tokenData: TokenData[] = [];

    accounts.forEach((account) => {
        // Check if the account data is parsed
        if ('parsed' in account.account.data) {
            const parsedAccountInfo = account.account.data.parsed;
            if (parsedAccountInfo.type === 'account' && parsedAccountInfo.info) {
                const info = parsedAccountInfo.info;
                const decimals = info.tokenAmount?.decimals;
                const mintAddress = info.mint;
                const tokenBalance = info.tokenAmount?.amount;

                if (decimals === 6 && tokenBalance && parseInt(tokenBalance) > 0) {
                    tokenData.push({
                        CA: mintAddress,
                        balance: tokenBalance
                    });
                }
            }
        }
    });

    return tokenData;
}

async function PnL() {
    try {
        const config = await loadConfig();
        const buyAmount = config.buyAmount;

        const holdings = await fetchTokens(config.pubKey);
        console.log(holdings);
       
        // iterate through tokens and calculate PnL
        for (const holding of holdings) {
            const mint = holding.CA;
            const sellAmount = holding.balance;

            // get bonding curve
            const bCurve = getBondingCurve(new PublicKey(mint), new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"));

            const bond = bCurve.toBase58();
            const sellLamports = parseInt(sellAmount); // Use BigInt for precision
            
            // calculate sell amount
            const sell = await calculateSellAmount(bond, sellLamports);
            const sellAmountSol = Number(sell) / 1e9; // Assuming sell is returned as lamports

            const pnl = sellAmountSol - buyAmount;
            const PNLpct = (pnl / buyAmount) * 100;

            console.log(`PnL: ${pnl.toFixed(4)} SOL`);
            console.log(`PnL %: ${PNLpct.toFixed(2)}%`);
        }
    } catch (error) {
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${error instanceof Error ? error.message : String(error)}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error;
    }
}

PnL();