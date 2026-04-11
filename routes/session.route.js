// routes/sessions.js
const express    = require("express");
const mongoose   = require("mongoose");
const crypto     = require("crypto");
const Session    = require("../models/session.model");
const authenticate = require("../middlewares/auth.middleware");
const requireHost  = require("../middlewares/admin.middleware");

const router = express.Router();

function formatSession(session) {
    const players = session.players.map((p) => ({
        id:       p._id,
        playerId: p.user._id || p.user,
        username: p.user?.username || p.user?.name || "Unknown",
        avatar:   p.user?.avatar   || null,
        role:     p.role,
        buyIn:    p.buyIn  ?? 0,
        chips:    p.chips  ?? 0,
    }));

    return {
        id:         session._id,
        name:       session.name,
        status:     session.status,
        date:       session.date,
        joinCode:   session.joinCode,
        createdAt:  session.createdAt,
        totalChips: players.reduce((sum, p) => sum + p.chips, 0),
        players,
    };
}

router.get("/my", authenticate, async (req, res) => {
    try {
        const sessions = await Session.find({ "players.user": req.user.id })
            .populate("players.user", "username name avatar")
            .populate("createdBy",    "username name avatar")
            .sort({ date: -1 });

        const formatted = sessions.map((s) => {
            const myEntry = s.players.find(
                (p) => String(p.user._id) === String(req.user.id)
            );

            const normaliseRole = (role) =>
                role === "ADMIN" || role === "ADMIN" ? "ADMIN" : "PLAYER";

            return {
                id:      s._id,
                name:    s.name,
                status:  s.status,
                date:    s.date,
                joinCode: s.joinCode,
                myRole:  normaliseRole(myEntry?.role),
                buyIn:   myEntry?.buyIn ?? 0,
                chips:   myEntry?.chips ?? 0,
                players: s.players.map((p) => ({
                    id:       p._id,
                    user:     p.user,
                    username: p.user?.username || p.user?.name || "Unknown",
                    avatar:   p.user?.avatar   || null,
                    role:     normaliseRole(p.role),
                    buyIn:    p.buyIn ?? 0,
                    chips:    p.chips ?? 0,
                })),
            };
        });

        let running = 0;
        const chartData = [...formatted].reverse().map((s) => {
            running += (s.chips ?? 0) - (s.buyIn ?? 0);
            return {
                label:       s.name.split(" ").slice(0, 2).join(" "),
                date:        s.date,
                sessionName: s.name,
                pnl:         running,
            };
        });

        res.json({ sessions: formatted, chartData });
    } catch (err) {
        console.error("[GET /sessions/my]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.get("/:id", authenticate, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ error: "Invalid session ID." });

        const session = await Session.findById(req.params.id)
            .populate("players.user", "username name avatar");

        if (!session)
            return res.status(404).json({ error: "Session not found." });

        const isMember = session.players.some(
            (p) => String(p.user._id || p.user) === String(req.user.id)
        );
        if (!isMember)
            return res.status(403).json({ error: "You are not part of this session." });

        res.json({ session: formatSession(session) });
    } catch (err) {
        console.error("[GET /sessions/:id]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.post("/join", authenticate, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code?.trim())
            return res.status(400).json({ error: "Join code is required." });

        const session = await Session.findOne({
            joinCode: code.trim().toUpperCase(),
        }).populate("players.user", "username name avatar");

        if (!session)
            return res.status(404).json({ error: "No session found with that code." });
        if (session.status === "COMPLETED")
            return res.status(400).json({ error: "This session has already ended." });

        const already = session.players.some(
            (p) => String(p.user._id || p.user) === String(req.user.id)
        );
        if (already)
            return res.status(409).json({ error: "You are already in this session." });

        const defaultBuyIn = session.players[0]?.buyIn ?? 0;

        session.players.push({
            user:  req.user.id,
            role:  "PLAYER",
            buyIn: defaultBuyIn,
            chips: defaultBuyIn,
        });

        await session.save();
        await session.populate("players.user", "username name avatar");

        res.json({ session: formatSession(session) });
    } catch (err) {
        console.error("[POST /sessions/join]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.post("/", authenticate, async (req, res) => {
    try {
        const { name, buyIn, playerIds } = req.body;

        if (!name?.trim())
            return res.status(400).json({ error: "Session name is required." });
        if (!buyIn || Number(buyIn) <= 0)
            return res.status(400).json({ error: "A valid buy-in amount is required." });

        const buyInNum  = Number(buyIn);
        const creatorId = String(req.user.id);
        const joinCode  = crypto.randomBytes(3).toString("hex").toUpperCase();

        const playersMap = new Map();
        let hasAdmin = false;

        if (Array.isArray(playerIds)) {
            for (const p of playerIds) {
                const pid  = String(p.playerId);
                const isManager = p.role === "MANAGER";
                const role = (p.role === "ADMIN" || isManager)? "ADMIN" : "PLAYER";
                if (role === "ADMIN") hasAdmin = true;
                if (pid) {
                    playersMap.set(pid, {
                        user: pid,
                        role,
                        buyIn: isManager ? 0 : buyInNum,
                        chips: isManager ? 0 : buyInNum
                    });
                }
            }
        }

        if (!hasAdmin) {
            if (playersMap.has(creatorId)) {
                playersMap.get(creatorId).role = "ADMIN";
            } else {
                playersMap.set(creatorId, {
                    user: creatorId,
                    role: "ADMIN",
                    buyIn: buyInNum,
                    chips: buyInNum
                });
            }
        }

        const session = await Session.create({
            name:      name.trim(),
            status:    "ACTIVE",
            joinCode,
            createdBy: creatorId,
            players:   [...playersMap.values()],
        });

        await session.populate("players.user", "username name avatar");

        res.status(201).json({ session: formatSession(session) });
    } catch (err) {
        console.error("[POST /sessions]", err);
        res.status(500).json({ error: "Failed to create session." });
    }
});

router.patch("/:id/chips", authenticate, requireHost, async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates) || updates.length === 0)
            return res.status(400).json({ error: "updates array is required." });

        const session = await Session.findById(req.params.id);
        if (!session)
            return res.status(404).json({ error: "Session not found." });
        if (session.status === "COMPLETED")
            return res.status(400).json({ error: "Cannot edit a completed session." });

        const currentTotal = session.players.reduce((sum, p) => sum + (p.chips || 0), 0);

        let newTotal = 0;

        for (const player of session.players) {
            const update = updates.find(u => u.playerId === player._id.toString());

            if (update) {
                newTotal += Number(update.chips);
            } else {
                newTotal += player.chips || 0;
            }
        }

        if (currentTotal !== newTotal) {
            return res.status(400).json({
                error: "Total chips must remain constant.",
                currentTotal,
                newTotal
            });
        }

        for (const { playerId, chips } of updates) {
            const entry = session.players.id(playerId);
            if (!entry) continue;

            entry.history.push({
                chips:      entry.chips,
                recordedAt: new Date(),
                recordedBy: req.user.id,
            });
            entry.chips = Number(chips);
        }

        await session.save();
        await session.populate("players.user", "username name avatar");

        res.json({ session: formatSession(session) });
    } catch (err) {
        console.error("[PATCH /sessions/:id/chips]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.post("/:id/rebuy", authenticate, requireHost, async (req, res) => {
    try {
        const { playerId, amount } = req.body;
        if (!playerId || !amount || Number(amount) <= 0)
            return res.status(400).json({ error: "playerId and a positive amount are required." });

        const session = await Session.findById(req.params.id);
        if (!session)
            return res.status(404).json({ error: "Session not found." });
        if (session.status === "COMPLETED")
            return res.status(400).json({ error: "Cannot edit a completed session." });

        const entry = session.players.id(playerId);
        if (!entry)
            return res.status(404).json({ error: "Player not found in this session." });

        entry.history.push({
            chips:      entry.chips,
            recordedAt: new Date(),
            recordedBy: req.user.id,
        });
        entry.buyIn  += Number(amount);
        entry.chips  += Number(amount);

        await session.save();
        await session.populate("players.user", "username name avatar");

        res.json({ session: formatSession(session) });
    } catch (err) {
        console.error("[POST /sessions/:id/rebuy]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.patch("/:id/end", authenticate, requireHost, async (req, res) => {
    try {
        const session = await Session.findByIdAndUpdate(
            req.params.id,
            { status: "COMPLETED" },
            { new: true }
        ).populate("players.user", "username name avatar");

        if (!session)
            return res.status(404).json({ error: "Session not found." });

        res.json({ session: formatSession(session) });
    } catch (err) {
        console.error("[PATCH /sessions/:id/end]", err);
        res.status(500).json({ error: "Server error." });
    }
});

router.patch("/:id", authenticate, requireHost, async (req, res) => {
    try {
        const { name, status } = req.body;
        const update = {};
        if (name)   update.name   = name.trim();
        if (status) update.status = status;

        const session = await Session.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        ).populate("players.user", "username name avatar");

        if (!session)
            return res.status(404).json({ error: "Session not found." });

        res.json({ session: formatSession(session) });
    } catch (err) {
        console.error("[PATCH /sessions/:id]", err);
        res.status(500).json({ error: "Server error." });
    }
});

module.exports = router;