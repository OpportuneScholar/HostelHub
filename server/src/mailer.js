import { emailConfig } from './config.js';

export const emailEnabled = () => emailConfig.provider !== 'none';

// Never log the message body in production: it contains the reset code.
export async function sendMail({ to, subject, text, html }) {
  const { provider, from, smtp } = emailConfig;
  if (provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${emailConfig.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!r.ok) throw new Error(`Email provider responded with status ${r.status}`);
    return;
  }
  if (provider === 'smtp') {
    const { default: nodemailer } = await import('nodemailer');
    await nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass } }).sendMail({ from, to, subject, text, html });
    return;
  }
  if (provider === 'console') { console.log(`[DEV EMAIL] to: ${to} | ${subject}\n${text}`); return; }
  throw new Error('No email provider configured');
}
