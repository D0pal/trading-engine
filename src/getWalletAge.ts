import loadConfig from "./loadConfig";
import axios from "axios";

interface Config {
    heliusAPIKey: string;
}

interface Transaction {
    timestamp: number;
}

async function getAge(wallet: string): Promise<number> {
    const config: Config = await loadConfig();
    const heliusAPIKey: string = config.heliusAPIKey;

    console.log(`Fetching transactions for wallet ${wallet}...`);
    try {
        const response = await axios.get<Transaction[]>(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`, {
            params: {
                'api-key': heliusAPIKey
            }
        });

        const data: Transaction[] = response.data;

        if (data.length === 0) {
            console.log("No transactions found for this wallet.");
            return 0;
        } 

        const totalLength: number = data.length;

        const lastTX: Transaction = data[totalLength - 1];

        const time: number = lastTX.timestamp;
        
        const date: Date = new Date(time * 1000);

        // check how many days between now and the date
        const today: Date = new Date();
        const diffTime: number = Math.abs(today.getTime() - date.getTime());

        const diffDays: number = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Error fetching transactions:", error.response?.status, error.response?.data);
        } else {
            console.error("An unexpected error occurred:", error);
        }
        return 0;
    }
}
export default getAge;