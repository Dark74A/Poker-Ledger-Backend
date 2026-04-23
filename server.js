require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const passport = require("passport");
const crypto   = require("crypto");
const { generalLimiter, authLimiter } = require("./middlewares/limiter.middleware");

const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
    console.error(`\n❌ Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
}

require("./config/passport");

const authRoutes    = require("./routes/auth.route");
const sessionRoutes = require("./routes/session.route");
const playerRoutes  = require("./routes/player.route");

const app  = express();
const PORT = Number(process.env.PORT) || 5000;

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });

const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

app.use(
    cors({
        origin: CLIENT_URL,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.options("/{*path}", cors());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.use("/api", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);

if (process.env.NODE_ENV !== "production") {
    app.use((req, _res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

app.use("/api/auth",     authRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/players",  playerRoutes);

app.get("/api/health", (_req, res) =>
    res.json({
        status:    "ok",
        timestamp: new Date().toISOString(),
        env:       process.env.NODE_ENV || "development",
    })
);

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

app.use((err, _req, res, _next) => {
    console.error("[Unhandled Error]", err);
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : err.message;
    res.status(err.status || 500).json({ error: message });
});

const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

const server = app.listen(PORT, () => {
    console.log(`
🃏 Poker Ledger API
────────────────────────────────
  API     →  ${SERVER_URL}/api
  Health  →  ${SERVER_URL}/api/health
  CORS    →  ${process.env.CLIENT_URL || "All Origins (Dev)"}
  DB      →  Connected ✅
────────────────────────────────
  `);
});

function shutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully…`);
    server.close(() => {
        mongoose.connection.close(false).then(() => {
            console.log("All connections closed.");
            process.exit(0);
        });
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));