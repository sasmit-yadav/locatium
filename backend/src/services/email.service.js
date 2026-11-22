const fs = require('fs/promises');
const path = require('path');
const nodemailer = require('nodemailer');
const { AppError } = require('../middleware/error.middleware');

const OUTBOX_DIR = path.join(__dirname, '..', '..', 'email-outbox');

function validateRecipient(email) {
  if (typeof email !== 'string' || !email.trim()) {
    throw AppError.badRequest('Recipient email is required');
  }
  const normalized = email.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!ok) throw AppError.badRequest('Invalid recipient email');
  return normalized;
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function createSmtpTransport() {
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transport = {
    host: process.env.SMTP_HOST,
    port,
    secure,
  };
  if (process.env.SMTP_USER) {
    transport.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || '',
    };
  }
  return nodemailer.createTransport(transport);
}

async function saveToOutbox({ to, subject, text, filename, pdfBuffer }) {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let pdfPath = null;
  let safeName = null;
  if (pdfBuffer) {
    safeName = (filename || 'report.pdf').replace(/[^\w.-]+/g, '_');
    pdfPath = path.join(OUTBOX_DIR, `${stamp}-${safeName}`);
    await fs.writeFile(pdfPath, pdfBuffer);
  }
  const metaPath = path.join(OUTBOX_DIR, `${stamp}-meta.json`);
  await fs.writeFile(
    metaPath,
    JSON.stringify({ to, subject, text, filename: safeName, pdfPath, savedAt: new Date().toISOString() }, null, 2)
  );

  return {
    deliveryMode: 'outbox',
    outboxPath: pdfPath || metaPath,
    messageId: `outbox-${stamp}`,
  };
}

/**
 * Sends one email. Without SMTP it is written to backend/email-outbox/ instead, so local
 * development (and verify / reset links) still works — open the meta.json to copy the link.
 */
async function sendEmail({ to, subject, text, filename, pdfBuffer }) {
  const recipient = validateRecipient(to);

  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[email] SMTP is not configured; message saved to outbox, not sent:', subject);
    }
    const outbox = await saveToOutbox({ to: recipient, subject, text, filename, pdfBuffer });
    return { to: recipient, ...outbox };
  }

  const transporter = createSmtpTransport();
  const message = {
    from: process.env.SMTP_FROM,
    to: recipient,
    subject,
    text,
  };
  if (pdfBuffer) {
    message.attachments = [
      {
        filename: filename || 'locatium-report.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ];
  }
  const info = await transporter.sendMail(message);

  return {
    to: recipient,
    deliveryMode: 'smtp',
    messageId: info.messageId,
  };
}

async function sendReportEmail(args) {
  return sendEmail(args);
}

module.exports = {
  sendEmail,
  sendReportEmail,
  smtpConfigured,
  OUTBOX_DIR,
};
