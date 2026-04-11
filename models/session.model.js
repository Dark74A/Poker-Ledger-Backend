const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
    {
        name: {
            type:     String,
            required: [true, "Session name is required"],
            trim:     true,
        },
        status: {
            type:    String,
            enum:    ["ACTIVE", "COMPLETED"],
            default: "ACTIVE",
        },
        joinCode: {
            type: String,
            required: true,
        },
        date: {
            type:    Date,
            default: Date.now,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        },
        players: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref:  "User",
            },
            role: {
                type: String,
                enum: ["ADMIN", "PLAYER"],
                default: "PLAYER",
            },
            buyIn: {
                type: Number,
                default: 0
            },
            chips: {
                type: Number,
                default: 0
            },
            history: [{
                chips: Number,
                recordedAt: {
                    type: Date,
                    default: Date.now
                },
                recordedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User"
                },
            }],
        }],
    },
    { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);