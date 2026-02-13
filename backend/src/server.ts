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
import authPlugin from "./plugins/auth.js";
import authMeRoutes from "./modules/auth/auth.me.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    const allowed = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.39.186:3000",
    ];

    // permite requests sin origin (curl/postman)
    if (!origin) return cb(null, true);

    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.get("/", async () => ({ ok: true, msg: "ROOT ALIVE" }));
app.get("/health", async () => ({ ok: true, name: "PRODEX API" }));

await app.register(authPlugin);
await app.register(suppliesRoutes);
await app.register(suppliesPurchasesRoutes);
await app.register(quotesPreviewRoutes);
await app.register(quotesRoutes);
await app.register(ordersConvertRoutes);
await app.register(authMeRoutes);

app.listen({ port: 4000, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
