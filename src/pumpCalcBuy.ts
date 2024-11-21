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

// Calculation of buy quote with dynamic bonding curve data
async function calculateBuyAmount(bondingCurvePublicKey: string, solAmountToBuy: number): Promise<number> {
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

        // Calculate buy amount using the buyQuote function
        const tokens = buyQuote(new BN(solAmountToBuy), t);
        let formattedTokens = Number(tokens) / 1e6;
        // let formattedSOL = solAmountToBuy / 1e9;
        // console.log(`Tokens you can buy with ${formattedSOL} SOL:`, formattedTokens);

        return formattedTokens;
    } catch (error) {
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${error instanceof Error ? error.message : String(error)}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error; // Rethrow the error after logging it
    }
}

// Simplified buy quote function without the isBuy check
function buyQuote(e: BN, t: BondingCurveParams): BN {
    try {
        if (e.eq(new BN(0)) || !t) {
            return new BN(0);
        }

        let product = t.virtualSolReserves.mul(t.virtualTokenReserves);
        let newSolReserves = t.virtualSolReserves.add(e);
        let newTokenAmount = product.div(newSolReserves).add(new BN(1));
        let s = t.virtualTokenReserves.sub(newTokenAmount);
        s = BN.min(s, t.realTokenReserves);
        return s;
    } catch (error) {
        // Write error to log file 
        const logFilePath = "./logs.txt";
        const errorMessage = `Error occurred: ${error instanceof Error ? error.message : String(error)}\n`;
        fs.appendFileSync(logFilePath, errorMessage);
        console.log("An error occurred, check logs.txt for more information.");
        throw error; // Rethrow the error after logging it
    }
}

export default calculateBuyAmount;