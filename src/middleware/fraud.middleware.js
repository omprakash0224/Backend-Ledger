const accountModel = require("../models/account.model");
const fraudAlertModel = require("../models/fraudAlert.model");
const { runFraudChecks } = require("../services/fraud.service");
const { sendFraudAlertEmail } = require("../services/email.service");

async function fraudDetectionMiddleware(req, res, next) {
  try {
    const { fromAccount: fromAccountId, toAccount: toAccountId } = req.body;
    const amount = Number(req.body.amount);
    const user = req.user;

    // ── 1. Basic guard — if essential fields are missing, skip fraud checks ──
    if (!fromAccountId || !toAccountId || !amount || isNaN(amount)) {
      return next();
    }

    // ── 2. Fetch the sender account document (needed for createdAt — Rule 5) ──
    const fromAccountDoc = await accountModel.findById(fromAccountId).lean();

    if (!fromAccountDoc) {
      // Account doesn't exist — let the transaction controller handle this error
      return next();
    }

    // ── 3. Verify ownership — ensure the fromAccount belongs to the current user ──
    if (fromAccountDoc.user.toString() !== user._id.toString()) {
      return next();
    }

    // ── 4. Run all fraud rules ────────────────────────────────────────────────
    const triggeredAlerts = await runFraudChecks(
      fromAccountDoc,
      toAccountId,
      amount,
      user
    );

    // ── 5. Nothing flagged — proceed immediately ──────────────────────────────
    if (!triggeredAlerts || triggeredAlerts.length === 0) {
      return next();
    }

    // ── 6. Build FraudAlert documents (transaction is null at this point) ─────
    const alertDocs = triggeredAlerts.map((alert) => ({
      account: fromAccountDoc._id,
      user: user._id,
      transaction: null,           // linked after transaction is created
      ruleCode: alert.ruleCode,
      severity: alert.severity,
      details: alert.details,
      status: "OPEN",
      metadata: alert.metadata,
    }));

    // ── 7. Bulk-insert alerts ─────────────────────────────────────────────────
    const insertedAlerts = await fraudAlertModel.insertMany(alertDocs, {
      ordered: false,              // insert all even if one fails
    });

    // ── 8. Attach inserted alert IDs to request for the controller to link ────
    req.fraudAlerts = insertedAlerts.map((a) => a._id);

    // ── 9. Fire-and-forget fraud alert email (never blocks the transaction) ───
    const ruleDescriptions = triggeredAlerts.map((a) => ({
      ruleCode: a.ruleCode,
      severity: a.severity,
      details: a.details,
    }));

    sendFraudAlertEmail(
      user.email,
      user.name,
      amount,
      toAccountId.toString(),      // ensure string, not ObjectId
      ruleDescriptions
    ).catch((err) =>
      console.error("[FraudMiddleware] Failed to send fraud alert email:", err)
    );

    // ── 10. Always proceed — flag-only mode ───────────────────────────────────
    return next();

  } catch (err) {
    // Fraud check failure must NEVER block a transaction
    console.error("[FraudMiddleware] Unexpected error during fraud checks:", err);
    return next();
  }
}

module.exports = { fraudDetectionMiddleware };