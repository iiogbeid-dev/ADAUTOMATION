import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, origin);
      }

      if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(config.logLevel));

app.use('/api', apiRouter);

// Serve audit log for convenience (read-only). Lock down in production.
app.get('/storage/audit-log.json', async (_req, res, next) => {
  try {
    res.sendFile(path.resolve(process.cwd(), 'storage', 'audit-log.json'));
  } catch (error) {
    next(error);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(
    `[server] listening on http://${config.host}:${config.port} (allowed origins: ${config.allowedOrigins.join(
      ', '
    )})`
  );
});
