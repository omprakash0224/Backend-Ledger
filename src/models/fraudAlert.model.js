const mongoose = require("mongoose");

const fraudAlertSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "account",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "transaction",
      default: null,
    },
    ruleCode: {
      type: String,
      enum: [
        "VELOCITY",
        "LARGE_AMOUNT",
        "RAPID_SUCCESSIVE",
        "DAILY_LIMIT",
        "NEW_ACCOUNT_HIGH_VALUE",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      required: true,
    },
    details: {
      type: String,
    },
    status: {
      type: String,
      enum: ["OPEN", "REVIEWED", "DISMISSED"],
      default: "OPEN",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups per account + rule over time
fraudAlertSchema.index({ account: 1, ruleCode: 1, createdAt: -1 });

const fraudAlertModel = mongoose.model("fraudAlert", fraudAlertSchema);

module.exports = fraudAlertModel;