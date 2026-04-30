import express          from 'express';
import nodemailer       from 'nodemailer';
import { body, validationResult } from 'express-validator';
import rateLimit        from 'express-rate-limit';

const router = express.Router();

/* ── Rate limit: 5 per IP per 15 min ─────────────────────── */
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many contact attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Validation ───────────────────────────────────────────── */
const validationRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name too long.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email address.'),
    // NOTE: normalizeEmail() removed — it was too aggressive in v7 and caused 422 false failures

  body('subject')
    .trim()
    .optional()
    .isLength({ max: 200 }).withMessage('Subject too long.'),

  body('message')
    .trim()
    .notEmpty().withMessage('Message is required.')
    .isLength({ min: 3, max: 2000 }).withMessage('Message must be at least 3 characters.'),
];

/* ── Nodemailer transporter ───────────────────────────────── */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/* ── Email HTML templates ─────────────────────────────────── */
function buildInboundHtml({ name, email, subject, message }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body  { font-family: Georgia, serif; background: #FBF0EC; color: #0D0A08; margin:0; padding:0; }
    .wrap { max-width:600px; margin:40px auto; background:#fff; border-top:3px solid #C9885A; }
    .hdr  { background:#0D0A08; padding:32px 40px; }
    .hdr h1 { color:#C9885A; font-size:24px; font-weight:300; margin:0; letter-spacing:2px; }
    .hdr p  { color:rgba(255,255,255,0.4); font-size:11px; letter-spacing:2px; text-transform:uppercase; margin:6px 0 0; font-family:sans-serif; }
    .body { padding:40px; }
    .row  { margin-bottom:20px; }
    .lbl  { font-family:sans-serif; font-size:9px; letter-spacing:3px; text-transform:uppercase; color:#C9885A; margin-bottom:4px; }
    .val  { font-size:15px; color:#1a1a1a; }
    .msg  { background:#FBF0EC; padding:20px; line-height:1.7; border-left:2px solid #C9885A; }
    .ftr  { background:#0D0A08; padding:20px 40px; font-family:sans-serif; font-size:10px; letter-spacing:2px; color:rgba(255,255,255,0.2); text-transform:uppercase; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>Charitha Portfolio</h1>
      <p>New contact form submission</p>
    </div>
    <div class="body">
      <div class="row"><div class="lbl">From</div><div class="val">${name}</div></div>
      <div class="row"><div class="lbl">Email</div><div class="val"><a href="mailto:${email}" style="color:#C9885A">${email}</a></div></div>
      ${subject ? `<div class="row"><div class="lbl">Subject</div><div class="val">${subject}</div></div>` : ''}
      <div class="row"><div class="lbl">Message</div><div class="msg">${message.replace(/\n/g, '<br/>')}</div></div>
    </div>
    <div class="ftr">Charitha Portfolio · Hyderabad</div>
  </div>
</body>
</html>`;
}

function buildAutoReplyHtml({ name }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body  { font-family: Georgia, serif; background: #FBF0EC; color: #0D0A08; margin:0; padding:0; }
    .wrap { max-width:600px; margin:40px auto; background:#fff; border-top:3px solid #C9885A; }
    .hdr  { background:#0D0A08; padding:32px 40px; text-align:center; }
    .hdr h1 { color:#C9885A; font-size:28px; font-weight:300; margin:0; letter-spacing:4px; }
    .body { padding:48px 40px; text-align:center; }
    .body p { font-size:15px; line-height:1.8; color:#444; margin:0 0 16px; }
    .gold { color:#C9885A; }
    .ftr  { background:#0D0A08; padding:20px 40px; font-family:sans-serif; font-size:10px; letter-spacing:2px; color:rgba(255,255,255,0.2); text-transform:uppercase; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr"><h1>Charitha</h1></div>
    <div class="body">
      <p style="font-size:24px;font-weight:300;color:#0D0A08;letter-spacing:1px">
        Thank you, <span class="gold">${name}</span>
      </p>
      <p>Your message has been received. I'll get back to you within 24–48 hours.</p>
      <p>Looking forward to connecting with you.</p>
      <p style="margin-top:32px;font-size:12px;color:#aaa">
        — Charitha<br/>Aspiring Actress · Hyderabad
      </p>
    </div>
    <div class="ftr">echaritha.1302@gmail.com · Hyderabad, India</div>
  </div>
</body>
</html>`;
}

/* ── POST /api/contact ────────────────────────────────────── */
router.post('/', contactLimiter, validationRules, async (req, res) => {
  /* Log incoming data in dev for debugging */
  if (process.env.NODE_ENV !== 'production') {
    console.log('[CONTACT] Received:', JSON.stringify(req.body));
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('[CONTACT] Validation errors:', errors.array());
    return res.status(422).json({
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }

  const { name, email, subject, message } = req.body;

  try {
    const transporter = createTransporter();

    /* Verify SMTP connection first */
    await transporter.verify();

    /* Email to Charitha */
    await transporter.sendMail({
      from: `"Portfolio Contact" <${process.env.SMTP_USER}>`,
      to:   process.env.CONTACT_RECEIVER || process.env.SMTP_USER,
      replyTo: email,
      subject: subject || `New portfolio enquiry from ${name}`,
      html: buildInboundHtml({ name, email, subject, message }),
    });

    /* Auto-reply to sender */
    await transporter.sendMail({
      from: `"Charitha | Actress" <${process.env.SMTP_USER}>`,
      to:   email,
      subject: 'Thank you for reaching out — Charitha',
      html: buildAutoReplyHtml({ name }),
    });

    console.log(`[CONTACT] Email sent from ${name} <${email}>`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[CONTACT ERROR]', err.message);
    return res.status(500).json({
      error: 'Failed to send email. Please contact directly via phone or email.',
    });
  }
});

export default router;
