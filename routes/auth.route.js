const express      = require("express");
const bcrypt       = require("bcryptjs");
const crypto       = require("crypto");
const jwt          = require("jsonwebtoken");
const authenticate = require("../middlewares/auth.middleware");
const User         = require("../models/user.model");
const { sendVerificationEmail } = require("../utils/resend");
const passport = require("passport");
const router = express.Router();

// ─── Helper ───────────────────────────────────────────────────────────────────
function issueToken(user) {
    return jwt.sign(
        { id: user._id, username: user.username || user.name },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

// ─── Signup ───────────────────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password || !email)
            return res.status(400).json({ error: "Username, email, and password are required." });
        if (username.length < 3)
            return res.status(400).json({ error: "Username must be at least 3 characters." });
        if (password.length < 6)
            return res.status(400).json({ error: "Password must be at least 6 characters." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: "Enter a valid email address." });

        if (await User.findOne({ username }))
            return res.status(409).json({ error: "Username already taken." });
        if (await User.findOne({ email }))
            return res.status(409).json({ error: "An account with that email already exists." });

        const hashed      = await bcrypt.hash(password, 10);
        const verifyToken = crypto.randomBytes(32).toString("hex");

        await User.create({
            username,
            email,
            password: hashed,
            isVerified: false,
            verifyToken
        });

        // try {
        //     await sendVerificationEmail(email, verifyToken);
        // } catch (mailErr) {
        //     console.error("[signup] Failed to send verification email:", mailErr);
        // }

        // return res.status(201).json({
        //     message: "Welcome to the Circle. Please check your email to verify your seat at the table."
        // });

        return res.status(201).json({
            message: "Welcome to the table! Your account has been created successfully. You can now log in and track your sessions.",
            type: "success"
        });

    } catch (err) {
        console.error("[signup]", err);
        return res.status(500).json({ error: "Server error during signup." });
    }
});

// ─── Verify Email ─────────────────────────────────────────────────────────────
router.post("/verify", async (req, res) => {
    try {
        const { token } = req.body;

        if (!token)
            return res.status(400).json({ error: "Verification token is missing." });

        const user = await User.findOne({ verifyToken: token });

        if (!user)
            return res.status(400).json({ error: "Invalid or expired verification link." });

        user.isVerified  = true;
        user.verifyToken = undefined;
        await user.save();

        return res.json({ message: "Email verified! You may now enter the table." });

    } catch (err) {
        console.error("[verify]", err);
        return res.status(500).json({ error: "Server error during verification." });
    }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password)
            return res.status(400).json({ error: "Username and password are required." });

        const user = await User.findOne({ username });

        if (!user || !user.password)
            return res.status(401).json({ error: "Invalid username or password." });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.status(401).json({ error: "Invalid username or password." });

        // if (!user.isVerified) {
        //     const newToken   = crypto.randomBytes(32).toString("hex");
        //     user.verifyToken = newToken;
        //     await user.save();
        //
        //     try {
        //         await sendVerificationEmail(user.email, newToken);
        //     } catch (mailErr) {
        //         console.error("[login] Failed to resend verification email:", mailErr);
        //         return res.status(500).json({
        //             error: "Account not verified, and we failed to send a new email. Please try again."
        //         });
        //     }
        //
        //     return res.status(403).json({
        //         error: "Account not verified. A fresh verification link has been sent to your email."
        //     });
        // }

        const token = issueToken(user);

        return res.json({
            token,
            user: { id: user._id, username: user.username }
        });

    } catch (err) {
        console.error("[login]", err);
        return res.status(500).json({ error: "Server error during login." });
    }
});

router.get("/me", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) return res.status(404).json({ error: "User not found." });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: "Server error." });
    }
});

router.get("/players", authenticate, async (req, res) => {
    try {
        const players = await User.find({ role: "PLAYER" })
            .select("_id username name avatar")
            .sort({ username: 1 });

        res.json({
            players: players.map((p) => ({
                id:       p._id,
                username: p.username || p.name || "unknown",
                avatar:   p.avatar || null,
            })),
        });
    } catch (err) {
        res.status(500).json({ error: "Server error." });
    }
});

router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
    "/google/callback",
    passport.authenticate("google", {
        session: false,
        failureRedirect: `${process.env.CLIENT_URL || "http://localhost:5173"}?error=google_failed`,
    }),
    (req, res) => {
        const token     = issueToken(req.user);
        const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
        res.redirect(`${clientUrl}?token=${token}`);
    }
);

module.exports = router;