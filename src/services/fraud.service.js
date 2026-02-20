const mongoose = require("mongoose");
const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");

// ─── Configurable Thresholds ─────────────────────────────────────────────────
const VELOCITY_WINDOW_MS        = 60 * 60 * 1000;        // 1 hour
const VELOCITY_THRESHOLD        = 5;                      // max transactions in window

const LARGE_AMOUNT_THRESHOLD    = 50_000;                 // single transaction limit

const RAPID_WINDOW_MS           = 5 * 60 * 1000;         // 5 minutes
                                                          // any duplicate pair in window = flag

const DAILY_LIMIT_THRESHOLD     = 200_000;                // cumulative debit limit per 24h
const DAILY_WINDOW_MS           = 24 * 60 * 60 * 1000;   // 24 hours

const NEW_ACCOUNT_WINDOW_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEW_ACCOUNT_AMOUNT_LIMIT  = 10_000;                 // high-value threshold for new accounts
// ─────────────────────────────────────────────────────────────────────────────


// Rule 1 — Velocity Check (DB)
// Flag if fromAccount has >= VELOCITY_THRESHOLD transactions in the last hour
async function checkVelocity(fromAccountId) {
  const since = new Date(Date.now() - VELOCITY_WINDOW_MS);

  const count = await transactionModel.countDocuments({
    fromAccount: fromAccountId,
    status: { $in: ["COMPLETED", "PENDING"] },
    createdAt: { $gte: since },
  });

  if (count >= VELOCITY_THRESHOLD) {
    return {
      ruleCode: "VELOCITY",
      severity: "MEDIUM",
      details: `${count} transactions in the last 60 minutes, threshold: ${VELOCITY_THRESHOLD}`,
      metadata: {
        transactionCount: count,
        windowMinutes: 60,
        threshold: VELOCITY_THRESHOLD,
        since,
      },
    };
  }

  return null;
}


// Rule 2 — Large Amount Threshold (synchronous)
// Flag if the single transaction amount exceeds LARGE_AMOUNT_THRESHOLD
function checkLargeAmount(amount) {
  if (amount > LARGE_AMOUNT_THRESHOLD) {
    return {
      ruleCode: "LARGE_AMOUNT",
      severity: "HIGH",
      details: `Transaction amount ₹${amount.toLocaleString("en-IN")} exceeds single-transaction limit of ₹${LARGE_AMOUNT_THRESHOLD.toLocaleString("en-IN")}`,
      metadata: {
        amount,
        threshold: LARGE_AMOUNT_THRESHOLD,
      },
    };
  }

  return null;
}


// Rule 3 — Rapid Successive Transfers (DB)
// Flag if the exact same fromAccount → toAccount pair has any transaction in the last 5 minutes
async function checkRapidSuccessive(fromAccountId, toAccountId) {
  const since = new Date(Date.now() - RAPID_WINDOW_MS);

  const existing = await transactionModel.findOne({
    fromAccount: fromAccountId,
    toAccount: toAccountId,
    createdAt: { $gte: since },
  }).lean();

  if (existing) {
    return {
      ruleCode: "RAPID_SUCCESSIVE",
      severity: "MEDIUM",
      details: `Duplicate transfer to the same account detected within ${RAPID_WINDOW_MS / 60000} minutes`,
      metadata: {
        windowMinutes: RAPID_WINDOW_MS / 60000,
        previousTransactionId: existing._id,
        previousTransactionAt: existing.createdAt,
      },
    };
  }

  return null;
}


// Rule 4 — Daily Cumulative Limit (DB)
// Flag if sum of all DEBIT ledger entries in the last 24h + current amount > DAILY_LIMIT_THRESHOLD
async function checkDailyLimit(fromAccountId, amount) {
  const since = new Date(Date.now() - DAILY_WINDOW_MS);

  const result = await ledgerModel.aggregate([
    {
      $match: {
        account: new mongoose.Types.ObjectId(fromAccountId),
        type: "DEBIT",
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        totalDebited: { $sum: "$amount" },
      },
    },
  ]);

  const totalDebited = result.length > 0 ? result[0].totalDebited : 0;
  const projectedTotal = totalDebited + amount;

  if (projectedTotal > DAILY_LIMIT_THRESHOLD) {
    return {
      ruleCode: "DAILY_LIMIT",
      severity: "HIGH",
      details: `Projected daily debit ₹${projectedTotal.toLocaleString("en-IN")} exceeds daily limit of ₹${DAILY_LIMIT_THRESHOLD.toLocaleString("en-IN")}`,
      metadata: {
        totalDebitedToday: totalDebited,
        currentAmount: amount,
        projectedTotal,
        threshold: DAILY_LIMIT_THRESHOLD,
        since,
      },
    };
  }

  return null;
}


// Rule 5 — New Account High-Value Transfer (synchronous)
// Flag if the account was created within the last 7 days AND amount > NEW_ACCOUNT_AMOUNT_LIMIT
function checkNewAccountHighValue(fromAccountDoc, amount) {
  const accountAgeMs = Date.now() - new Date(fromAccountDoc.createdAt).getTime();
  const isNewAccount = accountAgeMs < NEW_ACCOUNT_WINDOW_MS;

  if (isNewAccount && amount > NEW_ACCOUNT_AMOUNT_LIMIT) {
    const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
    return {
      ruleCode: "NEW_ACCOUNT_HIGH_VALUE",
      severity: "HIGH",
      details: `Account is only ${accountAgeDays} day(s) old and is attempting a high-value transfer of ₹${amount.toLocaleString("en-IN")}`,
      metadata: {
        accountCreatedAt: fromAccountDoc.createdAt,
        accountAgeDays,
        amount,
        amountThreshold: NEW_ACCOUNT_AMOUNT_LIMIT,
        newAccountWindowDays: NEW_ACCOUNT_WINDOW_MS / (24 * 60 * 60 * 1000),
      },
    };
  }

  return null;
}


// ─── Helper: generate a MongoDB ObjectId from a date ─────────────────────────
// No longer needed — ledger now has timestamps: true, createdAt is used directly
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Run all fraud detection rules against a pending transaction.
 *
 * @param {Object} fromAccountDoc  - Full Mongoose account document (needs _id, createdAt)
 * @param {ObjectId} toAccountId   - The recipient account _id
 * @param {Number}  amount         - Transaction amount
 * @param {Object}  user           - Authenticated user document (reserved for future rules)
 * @returns {Promise<Array>}       - Array of triggered alert objects (empty = clean)
 */
async function runFraudChecks(fromAccountDoc, toAccountId, amount, user) {
  const fromAccountId = fromAccountDoc._id;

  // Run DB-heavy checks in parallel
  const [velocityAlert, rapidAlert, dailyAlert] = await Promise.all([
    checkVelocity(fromAccountId),
    checkRapidSuccessive(fromAccountId, toAccountId),
    checkDailyLimit(fromAccountId, amount),
  ]);

  // Run synchronous checks locally (no DB needed)
  const largeAmountAlert      = checkLargeAmount(amount);
  const newAccountAlert       = checkNewAccountHighValue(fromAccountDoc, amount);

  // Collect all triggered alerts (filter out nulls)
  const alerts = [
    velocityAlert,
    largeAmountAlert,
    rapidAlert,
    dailyAlert,
    newAccountAlert,
  ].filter(Boolean);

  return alerts;
}

module.exports = { runFraudChecks };