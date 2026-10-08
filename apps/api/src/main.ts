import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { createApp } from "./bootstrap";
import { env } from "./config/env";

async function main() {
  const app = await createApp();
  const { PORT } = env();
  await app.listen(PORT, "0.0.0.0");
  Logger.log(`StockFlow API listening on http://localhost:${PORT}/api/v1`, "Bootstrap");
}

void main();
