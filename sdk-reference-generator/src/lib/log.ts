import chalk from "chalk";

export const log = {
  header(message: string): void {
    console.log(chalk.bold.cyan(`\n▸ ${message.toUpperCase()}`));
  },

  section(message: string): void {
    console.log(chalk.bold(`\n${message}`));
  },

  info(message: string, indent = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}${chalk.dim(">")} ${message}`);
  },

  success(message: string, indent = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}${chalk.green("✓")} ${message}`);
  },

  warn(message: string, indent = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}${chalk.yellow("!")} ${message}`);
  },

  error(message: string, indent = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}${chalk.red("✗")} ${message}`);
  },

  step(message: string, indent = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}${chalk.blue("-")} ${message}`);
  },

  stats(
    items: Array<{ label: string; value: string | number }>,
    indent = 0
  ): void {
    const prefix = "  ".repeat(indent);
    for (const { label, value } of items) {
      console.log(`${prefix}  ${chalk.gray(label + ":")} ${value}`);
    }
  },

  blank(): void {
    console.log("");
  },

  data(message: string, indent = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}  ${chalk.dim(message)}`);
  },

  summary(title: string): void {
    console.log(chalk.bold.white(`\n${title}`));
  },
};
