/**
 * @file src/index.js
 * @description Express server entry point for Charitha's portfolio backend.
 *              Handles the contact form endpoint with email via Nodemailer.
 */

import 'dotenv/config';
import express  from 'express';
import cors     from 'cors';
import helmet   from 'helmet';
import rateLimit from 'express-rate-limit';
import contactRouter from './routes/contact.js';

const app  = express();
const PORT = process.env.PORT || 5007;

/* ── Security middleware ───────────────────────────────────── */
app.use(helmet());

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser requests (Postman, health checks) and listed origins
    if (!origin || ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

/* ── Body parsing ─────────────────────────────────────────── */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/* ── Global rate limiter ──────────────────────────────────── */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

/* ── Routes ───────────────────────────────────────────────── */
app.use('/api/contact', contactRouter);

/* ── Health check ─────────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ── 404 handler ──────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

/* ── Global error handler ─────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

/* ── Start ────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🎬 Charitha Portfolio Backend`);
  console.log(`   ➜  http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}\n`);
});
