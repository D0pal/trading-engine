import * as bs58 from "bs58";
import * as borsh from "borsh";
import axios from "axios";
import { verifiedFetch } from "@helia/verified-fetch";

interface InputArgs {
  name: string;
  symbol: string;
  uri: string;
}

export interface Metadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export async function parseMetadata(
  pumpInstruction: any
): Promise<Metadata | null> {
  if (!pumpInstruction || !("data" in pumpInstruction)) return null;

  const decodedData = bs58.decode(pumpInstruction.data);
  const inputData = decodedData.slice(8);

  const inputArgs = borsh.deserialize(
    {
      struct: {
        name: "string",
        symbol: "string",
        uri: "string",
      },
    },
    inputData
  ) as InputArgs;

  if (inputArgs.uri.startsWith("https://ipfs.io/")) {
    console.log(inputArgs.uri);
    try {
      const response = await fetch(inputArgs.uri);
      const metadata = await response.json();
      return metadata;
    } catch (error) {
      console.error("Error fetching IPFS data:", error);
      return null;
    }
  }

  console.log("URI not supported:", inputArgs.uri);
  return null;
}
