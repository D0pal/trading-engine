import readline from "readline";
import fs from "fs";
import chalk from "chalk";
import buyThePump from "./src/pumpBuy";
import sellTheDump from "./src/pumpSell";
import monitorAFK from "./src/afk";
import monitorPump from "./src/pumpSniper";

let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("SIGINT", () => {
  process.exit();
});
async function main() {
  console.log("\n");

  while (true) {
    console.log(chalk.yellow("What would you like to do?"));
    console.log(chalk.green("B: BUY"));
    console.log(chalk.magenta("S: SELL"));
    console.log(chalk.blue("SN: Snipe New Token"));
    console.log(chalk.hex("#6405ce")("A: AFK Mode"));
    console.log(chalk.red("Q: QUIT"));
    const action: string = await new Promise((resolve) => {
      rl.question("\n--> ", resolve);
    });

    if (action.toUpperCase() === "BUY" || action.toUpperCase() === "B") {
      let mint: string = await new Promise((resolve) =>
        rl.question("Enter Token CA: ", resolve)
      );
      await buyThePump(mint);
    } else if (
      action.toUpperCase() === "SELL" ||
      action.toUpperCase() === "S"
    ) {
      let mint: string = await new Promise((resolve) =>
        rl.question("Enter Token CA: ", resolve)
      );

      await sellTheDump(mint);
    } else if (
      action.toUpperCase() === "QUIT" ||
      action.toUpperCase() === "Q"
    ) {
      console.log(chalk.red("Goodbye"));
      process.exit(0);
    } else if (action.toUpperCase() === "AFK" || action.toUpperCase() === "A") {
      await monitorAFK();
    } else if (
      action.toUpperCase() === "SN" ||
      action.toUpperCase() === "SNIPE"
    ) {
      await monitorPump();
    } else {
      console.log(chalk.red("Invalid input, please try again."));
      await main();
    }
  }
}
main().catch(console.error);
