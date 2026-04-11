const Session = require("../models/session.model");
async function requireHost(req, res, next) {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ error: "Session not found." });

        const myEntry = session.players.find(
            (p) => String(p.user) === String(req.user.id)
        );
        if (!myEntry || myEntry.role !== "ADMIN")
            return res.status(403).json({ error: "Only the session host can do this." });

        req.session = session;
        next();
    } catch (err) {
        res.status(500).json({ error: "Server error." });
    }
}

module.exports = requireHost;