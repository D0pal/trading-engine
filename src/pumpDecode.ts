import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { BondingCurveLayout } from "./PUMP_LAYOUT";
import loadConfig from "./loadConfig";
import NodeCache from "node-cache";

interface Config {
  rpcURL: string;
  wsURL: string;
}

interface BondingCurveData {
  vTokenReserve: string;
  vSolReserve: string;
  rTokenReserves: string;
  rSolReserves: string;
  tokenTotalSupply: string;
  adjustedVTokenReserve: number;
  adjustedVSolReserve: number;
  virtualTokenPrice: number;
}

const cache = new NodeCache({ stdTTL: 60 }); // Cache for 60 seconds
let connection: Connection | null = null;

async function getConnection(): Promise<Connection> {
  if (!connection) {
    const config: Config = await loadConfig();
    connection = new Connection(config.rpcURL, {
      commitment: "confirmed",
      wsEndpoint: config.wsURL,
    });
  }
  return connection;
}

async function GPA(bonding_curve: string): Promise<BondingCurveData> {
  const cacheKey = `bonding_curve_${bonding_curve}`;
  const cachedData = cache.get<BondingCurveData>(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    const conn = await getConnection();
    console.log({ bonding_curve });
    const curve = new PublicKey(bonding_curve);
    const data = await conn.getAccountInfo(curve, { commitment: "confirmed" });

    if (!data) {
      throw new Error("Account info not found");
    }

    const buffer = Buffer.from(data.data).slice(8);
    const decodedData = BondingCurveLayout.deserialize(buffer);

    const result: BondingCurveData = {
      vTokenReserve: decodedData.virtualTokenReserves.toString(),
      vSolReserve: decodedData.virtualSolReserves.toString(),
      rTokenReserves: decodedData.realTokenReserves.toString(),
      rSolReserves: decodedData.realSolReserves.toString(),
      tokenTotalSupply: decodedData.tokenTotalSupply.toString(),
      adjustedVTokenReserve: Number(decodedData.virtualTokenReserves) / 1e6,
      adjustedVSolReserve: Number(decodedData.virtualSolReserves) / 1e9,
      virtualTokenPrice: 0,
    };

    result.virtualTokenPrice =
      result.adjustedVSolReserve / result.adjustedVTokenReserve;

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    const logFilePath = "./logs.txt";
    const errorMessage = `Error occurred: ${
      error instanceof Error ? error.message : String(error)
    }\n`;
    fs.appendFileSync(logFilePath, errorMessage);
    console.log("An error occurred, check logs.txt for more information.");
    throw error;
  }
}

export default GPA;
