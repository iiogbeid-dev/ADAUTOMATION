import { Router } from 'express';
import { generatePlan } from '../controllers/promptController.js';

export const promptRouter = Router();

promptRouter.post('/plan', generatePlan);
