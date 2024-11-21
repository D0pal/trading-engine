import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";
import { getBondingCurve } from "./getKeys";
import devSoldJEEET from "./afkSell";
import WebSocket from 'ws';


async function devSellTracker(devAddress: string): Promise<void> {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    if (process.send) {
        process.send(`Started tracking dev address: ${devAddress}`);
    }

    let isFirstMessage = true;

    ws.on('open', function open() {
        console.log('WebSocket connection opened.');
        // Subscribing to trades made by accounts
        const payload = {
            method: "subscribeAccountTrade",
            keys: [devAddress] // array of accounts to watch
        };

        ws.send(JSON.stringify(payload));
    });

    ws.on('message', async function message(data: string) {
        if (isFirstMessage) {
            isFirstMessage = false;
            return;
        }

        try {
            const parsedData = JSON.parse(data);
            const { mint, txType } = parsedData;

            console.log(`Received trade: ${mint} - ${txType}`);

            const token = mint;
            
            if (txType === 'sell') {
                console.log('Selling ' + token);
                // read mint.json
                const mintData: any = fs.readFileSync("./mint.json");

                // parse mint.json
                const mintJson = JSON.parse(mintData);

                // find the dev address in mint.json
                const dev: any = mintJson.find((dev: { devAddress: string; }) => dev.devAddress === devAddress);

                // if the dev address is not found, return
                if (!dev) {
                    console.log("Developer not found in mint.json.");
                    return;
                }

                // find the mint in mint.json
                const mintFound = mintJson.find((mint: { mint: string; }) => mint.mint === token);

                // if the mint is not found, return
                if (!mintFound) {
                    console.log(`Mint ${token} not found in mint.json.`);
                    return;
                }

                // if the dev address is found, break down the JSON to get the values we need
                const ata = dev.associatedTokenAccount;
                const sellAmount = dev.tokenAmount;
                const sellAmountLamports = dev.tokenAmountLamports;
                const mint = new PublicKey(token);
                const pumpProgramId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
                const bondingCurvePda = getBondingCurve(mint, pumpProgramId);
                const bondingCurveAta = getAssociatedTokenAddressSync(mint, bondingCurvePda, true);

                await devSoldJEEET(mint, bondingCurvePda, bondingCurveAta, ata, sellAmount, sellAmountLamports);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
            console.error('Received data:', data);
        }
    });

    ws.on('error', function error(err: Error) {
        console.error('WebSocket error:', err);
    });

    ws.on('close', function close(code: number, reason: string) {
        console.log(`WebSocket connection closed: ${code} - ${reason}`);
    });
}

// Check if devAddress is provided
const devAddress = process.argv[2];
if (!devAddress) {
    console.error('No dev address provided');
    process.exit(1);
}

devSellTracker(devAddress).catch((error) => {
    console.error('Error in devSellTracker:', error);
    process.exit(1);
});

/*
async function devTracker(devAddress: string): Promise<void> {
    const config = await loadConfig();
    const rpc = config.rpcURL;
    const ws = config.wsURL;

    const connection = new Connection(rpc, { commitment: 'confirmed', wsEndpoint: ws });

    console.log(chalk.green("Monitoring " + devAddress + " for new transactions..."));
    const trackMe = new PublicKey(devAddress);

    return new Promise((resolve, reject) => {
        connection.onLogs(
            trackMe,
            async ({ logs, err, signature }) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (logs && logs.some(log => log.includes("Sell"))) {
                    console.log(chalk.green("New transaction detected: " + signature));
                    await fetchAccounts(signature, connection, devAddress);
                    resolve(); // Resolve the promise when processing is complete
                }
            },
            "confirmed"
        );
    });
}

async function fetchAccounts(txId: string, connection: Connection, devAddress: string) {
    const PUMP_PUBLIC_KEY = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

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
        logger.warn("Required accounts not found in the transaction.");
        return;
    }

    const mint = pumpInstruction.accounts[0];
    const bondingCurve = pumpInstruction.accounts[2];
    const aBondCurve = pumpInstruction.accounts[3];
    const creator = pumpInstruction.accounts[7];

    const caString = mint.toBase58();

    // read mint.json
    const mintData: any = fs.readFileSync("./mint.json");

    // parse mint.json
    const mintJson = JSON.parse(mintData);

    // find the dev address in mint.json
    const dev: any = mintJson.find((dev: { devAddress: string; }) => dev.devAddress === devAddress);

    // if the dev address is not found, return
    if (!dev) {
        console.log("Developer not found in mint.json.");
        return;
    }

    // find the mint in mint.json
    const mintFound = mintJson.find((mint: { mint: string; }) => mint.mint === caString);

    // if the mint is not found, return
    if (!mintFound) {
        console.log(`Mint ${mint.toBase58()} not found in mint.json.`);
        return;
    }

    // if the dev address is found, break down the JSON to get the values we need
    const ata = dev.associatedTokenAccount;
    const sellAmount = dev.tokenAmount;
    const sellAmountLamports = dev.tokenAmountLamports;

    await devSoldJEEET(mint, bondingCurve, aBondCurve, ata, sellAmount, sellAmountLamports);
}
*/