import "./bootstrap.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { suppliesRoutes } from "./modules/supplies/supplies.routes.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { suppliesPurchasesRoutes } from "./modules/supplies/supplies.purchases.routes.js";
import { quotesPreviewRoutes } from "./modules/quotes/quotes.preview.routes.js";
import { quotesRoutes } from "./modules/quotes/quotes.routes.js";
import { ordersConvertRoutes } from "./modules/orders/orders.convert.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});

app.get("/health", async () => ({ ok: true, name: "PRODEX API" }));

await app.register(suppliesRoutes);
await app.register(suppliesPurchasesRoutes);
await app.register(quotesPreviewRoutes);
await app.register(quotesRoutes);
await app.register(ordersConvertRoutes);

app.listen({ port: 4000, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
