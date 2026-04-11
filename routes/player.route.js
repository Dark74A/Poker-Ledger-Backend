const express    = require("express");
const User       = require("../models/user.model");
const Session = require("../models/session.model");
const authenticate = require("../middlewares/auth.middleware");
const router = express.Router();

router.get("/", authenticate, async (req, res) => {
    try {
        const players = await User.find()
            .select("_id username name avatar createdAt")
            .sort({ username: 1 })
            .lean();

        const allSessions = await Session.find().lean();

        const recordsByPlayer = {};
        for (const session of allSessions) {
            for (const p of session.players) {
                const playerIdStr = String(p.user);

                if (!recordsByPlayer[playerIdStr]) {
                    recordsByPlayer[playerIdStr] = [];
                }

                recordsByPlayer[playerIdStr].push(p);
            }
        }

        const result = players.map((p) => {
            const myRecords = recordsByPlayer[String(p._id)] || [];

            const count        = myRecords.length;
            const totalBuyIn   = myRecords.reduce((s, r) => s + (r.buyIn || 0), 0);
            const totalChips   = myRecords.reduce((s, r) => s + (r.chips || 0), 0);
            const netPnL       = totalChips - totalBuyIn;

            const wins         = myRecords.filter((r) => (r.chips || 0) > (r.buyIn || 0)).length;
            const deltas       = myRecords.map((r) => (r.chips || 0) - (r.buyIn || 0));

            const bestSession  = deltas.length ? Math.max(...deltas) : 0;
            const worstSession = deltas.length ? Math.min(...deltas) : 0;
            const winRate      = count ? Math.round((wins / count) * 100) : 0;

            const hostedCount  = myRecords.filter((r) => r.role === "HOST" || r.role === "ADMIN").length;

            return {
                id:           p._id,
                username:     p.username || p.name || "Unknown",
                avatar:       p.avatar   || null,
                createdAt:    p.createdAt,
                sessions:     count,
                hostedCount,
                totalBuyIn,
                totalChips,
                netPnL,
                bestSession,
                worstSession,
                winRate
            };
        });

        res.json({ players: result });
    } catch (err) {
        console.error("[GET /players]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.get("/stats", authenticate, async (req, res) => {
    try {
        const sessions = await Session.find({ "players.user": req.user.id });

        const myRecords = sessions.map((s) =>
            s.players.find((p) => String(p.user) === String(req.user.id))
        ).filter(Boolean);

        const count        = myRecords.length;
        const totalBuyIn   = myRecords.reduce((s, p) => s + p.buyIn, 0);
        const totalChips   = myRecords.reduce((s, p) => s + p.chips, 0);
        const netPnL       = totalChips - totalBuyIn;
        const wins         = myRecords.filter((p) => p.chips > p.buyIn).length;
        const deltas       = myRecords.map((p) => p.chips - p.buyIn);
        const bestSession  = deltas.length ? Math.max(...deltas) : 0;
        const worstSession = deltas.length ? Math.min(...deltas) : 0;
        const avgPerSession= count ? Math.round(netPnL / count) : 0;
        const winRate      = count ? Math.round((wins / count) * 100) : 0;
        const hostedCount  = myRecords.filter((p) => p.role === "HOST").length;

        res.json({ stats: {
                sessions: count, hostedCount, totalBuyIn, totalChips,
                netPnL, bestSession, worstSession, avgPerSession, winRate,
            }});
    } catch (err) {
        res.status(500).json({ error: "Server error." });
    }
});


router.get("/search/:username", authenticate, async (req, res) => {
    try {
        const { username } = req.params;

        const player = await User.findOne({
            username: { $regex: new RegExp(`^${username}$`, "i") }
        }).select("-password");

        if (!player) {
            return res.status(404).json({ message: "Player not found." });
        }

        res.json({ players: [player] });
    } catch (err) {
        console.error("Search Error:", err);
        res.status(500).json({ message: "Server error during player search." });
    }
});

module.exports = router;