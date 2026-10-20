import { Router } from 'express';
import { pinGate } from '../middleware/pinGate.js';
import { promptRouter } from './prompts.js';
import { executionRouter } from './executions.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.use('/prompts', pinGate, promptRouter);
apiRouter.use('/executions', pinGate, executionRouter);
