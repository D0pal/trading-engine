import fs from 'fs';
async function loadConfig() {
    const rawConfig = fs.readFileSync("./config.json", "utf8");
    const parsedConfig = JSON.parse(rawConfig);
    let pubKey = parsedConfig.publicKey;
    let privKey = parsedConfig.privateKey;
    let rpcURL = parsedConfig.rpc;
    let wsURL = parsedConfig.ws;
    let buyAmount = parsedConfig.buyAmount.includes('.') ? parseFloat(parsedConfig.buyAmount) : parseInt(parsedConfig.buyAmount, 10);
    let blockEngineURL = parsedConfig.blockEngineUrl;
    let jitoTip = parsedConfig.jitoTipPK;
    let jitoTipAmount = parsedConfig.jitoTipSOL;
    let computeUnit = parsedConfig.computeUnit;
    let computeLimit = parsedConfig.computeLimit;
    let apiKey = parsedConfig.apiKey;
    let heliusAPIKey = parsedConfig.heliusAPIKey;
    
    return {
        pubKey,
        privKey,
        rpcURL,
        wsURL,
        buyAmount,
        blockEngineURL,
        jitoTip,
        jitoTipAmount,
        computeUnit,
        computeLimit,
        apiKey,
        heliusAPIKey
    };
}
export default loadConfig;