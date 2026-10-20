import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = ['UI_ACCESS_PIN'];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(
      `[config] Environment variable ${key} is not set. Using fallback value where available.`
    );
  }
});

const parseList = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const derivedOrigins = parseList(process.env.ALLOWED_ORIGINS);

const deriveHost = () => {
  const raw = process.env.HOST;
  if (raw === undefined) {
    return '0.0.0.0';
  }
  if (raw.toLowerCase() === 'public') {
    return '0.0.0.0';
  }
  return raw || '0.0.0.0';
};

const defaultOrigins = ['*'];

export const config = {
  host: deriveHost(),
  port: Number(process.env.PORT) || 4000,
  uiAccessPin: process.env.UI_ACCESS_PIN || '227470',
  allowedOrigins: derivedOrigins.length ? derivedOrigins : defaultOrigins,
  logLevel: process.env.LOG_LEVEL || 'dev',
  automationSandboxPath: process.env.AUTOMATION_SANDBOX_PATH || '../infrastructure/ad-lab'
};
