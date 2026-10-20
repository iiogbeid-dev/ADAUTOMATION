import { Router } from 'express';
import { runExecution } from '../controllers/executionController.js';

export const executionRouter = Router();

executionRouter.post('/run', runExecution);
