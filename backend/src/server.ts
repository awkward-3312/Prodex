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
import { productsRoutes } from "./modules/products/products.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { quoteGroupsRoutes } from "./modules/quote-groups/quote-groups.routes.js";
import { customersRoutes } from "./modules/customers/customers.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = Fastify({ logger: true });

const allowedOrigins =
  process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.39.186:3000",
  ];

await app.register(cors, {
  origin: (origin, cb) => {

    // permite requests sin origin (curl/postman)
    if (!origin) return cb(null, true);

    if (allowedOrigins.includes(origin)) return cb(null, true);
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
await app.register(quoteGroupsRoutes);
await app.register(ordersConvertRoutes);
await app.register(authMeRoutes);
await app.register(productsRoutes);
await app.register(dashboardRoutes);
await app.register(customersRoutes);

app.listen({ port: 4000, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
