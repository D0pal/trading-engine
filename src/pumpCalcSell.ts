import BN from 'bn.js';
import GPA from './pumpDecode';
import fs from 'fs';

interface BondingCurveData {
    vTokenReserve: string;
    vSolReserve: string;
    rTokenReserves: string;
}

interface BondingCurveParams {
    virtualSolReserves: BN;
    virtualTokenReserves: BN;
    realTokenReserves: BN;
}

// Calculation of sell amount with dynamic bonding curve data
async function calculateSellAmount(bondingCurvePublicKey: string, tokenAmountToSell: number): Promise<BN> {
    try {
        const {
            vTokenReserve,
            vSolReserve,
            rTokenReserves,
        }: BondingCurveData = await GPA(bondingCurvePublicKey);

        // Set bonding curve parameters based on fetched data
        let t: BondingCurveParams = {
            virtualSolReserves: new BN(vSolReserve),
            virtualTokenReserves: new BN(vTokenReserve),
            realTokenReserves: new BN(rTokenReserves),
        };

        // Calculate sell amount using the sellQuote function
        const solOutput = sellQuote(new BN(tokenAmountToSell), t);

        return solOutput; // Return the SOL output
    } catch (error) {
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${error instanceof Error ? error.message : String(error)}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error; // Rethrow the error after logging it
    }
}

// sellQuote to return the full SOL amount
function sellQuote(e: BN, t: BondingCurveParams): BN {
    try {
        if (e.eq(new BN(0)) || !t) {
            console.log("No tokens to sell or missing bonding curve data.");
            return new BN(0);
        }

        let product = t.virtualSolReserves.mul(t.virtualTokenReserves);
        let newTokenReserves = t.virtualTokenReserves.add(e);
        let newSolAmount = product.div(newTokenReserves);
        let solToReceive = t.virtualSolReserves.sub(newSolAmount);

        return solToReceive; // Return raw BN without dividing, to keep precision
    } catch (error) {
        // Write error to log file
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${error instanceof Error ? error.message : String(error)}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error; // Rethrow the error after logging it
    }
}

export default calculateSellAmount;