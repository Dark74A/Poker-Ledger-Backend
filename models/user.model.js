const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: { type: String, unique: true, sparse: true, trim: true },
        password: { type: String },

        isVerified: { type: Boolean, default: false },
        verifyToken: { type: String },

        googleId: { type: String, unique: true, sparse: true },
        email:    { type: String, unique: true, sparse: true, lowercase: true, trim: true },
        name:     { type: String },
        avatar:   { type: String },
        role: {
            type:    String,
            enum:    ["PLAYER"],
            default: "PLAYER",
        },
    },
    { timestamps: true }
);

userSchema.virtual("displayName").get(function () {
    return this.username || this.name || "Unknown";
});

module.exports = mongoose.model("User", userSchema);