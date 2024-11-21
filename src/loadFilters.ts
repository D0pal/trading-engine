import fs from 'fs';
import NodeCache from 'node-cache';

interface Filters {
    minDevBuy: number;
    maxDevBuy: number;
    minDevPct: number;
    maxDevPct: number;
    minDevBal: number;
    maxDevBal: number;
    twitter: string;
    website: string;
    telegram: string;
    bannedNames: string[];
    bannedCreators: string[];
    age: number;
}

const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

function parseNumber(value: string | number): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        return value.includes('.') ? parseFloat(value) : parseInt(value, 10);
    }
    throw new Error(`Invalid value type: ${typeof value}`);
}

async function loadFilters(): Promise<Filters> {
    const cacheKey = 'filters';
    const cachedFilters = cache.get<Filters>(cacheKey);
    if (cachedFilters) {
        return cachedFilters;
    }

    try {
        const rawFilters = await fs.promises.readFile("./filters.json", "utf8");
        const parsedFilters = JSON.parse(rawFilters);

        const filters: Filters = {
            minDevBuy: parseNumber(parsedFilters.minDevBuy),
            maxDevBuy: parseNumber(parsedFilters.maxDevBuy),
            minDevPct: parseNumber(parsedFilters.minDevPct),
            maxDevPct: parseNumber(parsedFilters.maxDevPct),
            minDevBal: parseNumber(parsedFilters.minDevBal),
            maxDevBal: parseNumber(parsedFilters.maxDevBal),
            twitter: parsedFilters.twt,
            website: parsedFilters.web,
            telegram: parsedFilters.tg,
            bannedNames: parsedFilters.bannedNames,
            bannedCreators: parsedFilters.bannedCreators,
            age: parseNumber(parsedFilters.age)
        };

        cache.set(cacheKey, filters);
        return filters;
    } catch (error) {
        console.error('Error loading filters:', error);
        throw error;
    }
}

export default loadFilters;