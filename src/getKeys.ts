import { PublicKey } from "@solana/web3.js";
import { encode } from "@coral-xyz/anchor/dist/cjs/utils/bytes/utf8.js";

export function getBondingCurve(mint: PublicKey, programId: PublicKey) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            encode("bonding-curve"),
            mint.toBuffer(),
        ],
        programId,
    )
    return pda
}