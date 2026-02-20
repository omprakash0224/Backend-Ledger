const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Backend Ledger" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendRegistrationEmail(userEmail, name) {
    const subject = 'Welcome to Backend Ledger!';
    const text = `Hello ${name},\n\nThank you for registering at Backend Ledger. We're excited to have you on board!\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Failed';
    const text = `Hello ${name},\n\nWe regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendFraudAlertEmail(userEmail, name, amount, toAccount, ruleDescriptions) {
  const subject = '⚠️ Fraud Alert: Suspicious Transaction Detected';

  // ── Severity badge for plain text ────────────────────────────────────────
  const severityLabel = { HIGH: '[HIGH]', MEDIUM: '[MEDIUM]', LOW: '[LOW]' };

  // ── Plain text body ───────────────────────────────────────────────────────
  const ruleLines = ruleDescriptions
    .map((r) => `  • ${severityLabel[r.severity] || ''} ${r.ruleCode}: ${r.details}`)
    .join('\n');

  const text = [
    `Hello ${name},`,
    ``,
    `We detected suspicious activity on your account for a transaction of ₹${amount.toLocaleString('en-IN')} to account ${toAccount}.`,
    ``,
    `The following rule(s) were triggered:`,
    ruleLines,
    ``,
    `The transaction has been processed, but our fraud detection system has flagged it for review.`,
    `If you did not initiate this transaction, please contact our support team immediately.`,
    ``,
    `Best regards,`,
    `The Backend Ledger Team`,
  ].join('\n');

  // ── Severity badge styles for HTML ───────────────────────────────────────
  const severityStyles = {
    HIGH:   'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;',
    MEDIUM: 'background:#fef9c3; color:#854d0e; border:1px solid #fde047;',
    LOW:    'background:#f0fdf4; color:#166534; border:1px solid #86efac;',
  };

  const ruleRows = ruleDescriptions
    .map((r) => {
      const badgeStyle = severityStyles[r.severity] || '';
      return `
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #f3f4f6;">
            <span style="
              display:inline-block;
              padding:2px 8px;
              border-radius:4px;
              font-size:11px;
              font-weight:700;
              letter-spacing:0.05em;
              ${badgeStyle}
            ">${r.severity}</span>
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #f3f4f6; font-weight:600; color:#374151;">
            ${r.ruleCode}
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #f3f4f6; color:#6b7280; font-size:13px;">
            ${r.details}
          </td>
        </tr>`;
    })
    .join('');

  // ── HTML body ─────────────────────────────────────────────────────────────
  const html = `
    <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; color:#111827;">

      <!-- Header -->
      <div style="background:#dc2626; padding:24px 32px; border-radius:8px 8px 0 0;">
        <h1 style="margin:0; color:#ffffff; font-size:20px;">⚠️ Fraud Alert</h1>
        <p style="margin:4px 0 0; color:#fecaca; font-size:13px;">Suspicious transaction detected on your account</p>
      </div>

      <!-- Body -->
      <div style="background:#ffffff; padding:24px 32px; border:1px solid #e5e7eb; border-top:none;">
        <p style="margin:0 0 16px;">Hello <strong>${name}</strong>,</p>

        <p style="margin:0 0 16px;">
          Our fraud detection system flagged a transaction of
          <strong>₹${amount.toLocaleString('en-IN')}</strong>
          to account <strong>${toAccount}</strong>.
        </p>

        <!-- Alert summary box -->
        <div style="
          background:#fef2f2;
          border:1px solid #fca5a5;
          border-radius:6px;
          padding:12px 16px;
          margin-bottom:20px;
        ">
          <p style="margin:0; font-size:13px; color:#7f1d1d;">
            <strong>${ruleDescriptions.length} rule(s) triggered.</strong>
            The transaction was processed, but has been flagged for review.
          </p>
        </div>

        <!-- Rules table -->
        <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:24px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px; text-align:left; color:#6b7280; font-weight:600; font-size:12px; text-transform:uppercase; border-bottom:2px solid #e5e7eb;">Severity</th>
              <th style="padding:10px 12px; text-align:left; color:#6b7280; font-weight:600; font-size:12px; text-transform:uppercase; border-bottom:2px solid #e5e7eb;">Rule</th>
              <th style="padding:10px 12px; text-align:left; color:#6b7280; font-weight:600; font-size:12px; text-transform:uppercase; border-bottom:2px solid #e5e7eb;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${ruleRows}
          </tbody>
        </table>

        <p style="margin:0 0 8px; font-size:14px; color:#374151;">
          If you <strong>did not</strong> initiate this transaction, please contact our support team immediately.
        </p>
        <p style="margin:0; font-size:14px; color:#374151;">
          If this was you, no further action is required.
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f9fafb; padding:16px 32px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px; text-align:center;">
        <p style="margin:0; font-size:12px; color:#9ca3af;">
          This is an automated security alert from <strong>Backend Ledger</strong>.<br/>
          Please do not reply to this email.
        </p>
      </div>

    </div>`;

  await sendEmail(userEmail, subject, text, html);
}

module.exports = {
  sendEmail,
  sendRegistrationEmail,
  sendTransactionEmail,
  sendTransactionFailureEmail,
  sendFraudAlertEmail,           // ← new export
};