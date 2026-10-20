import { planService } from '../services/planService.js';

export async function generatePlan(req, res, next) {
  try {
    const { prompt } = req.body || {};

    if (!prompt) {
      return res.status(400).json({
        error: 'PROMPT_REQUIRED',
        message: 'Provide a natural-language prompt describing the desired automation.'
      });
    }

    const plan = await planService.createPlan(prompt);
    res.json(plan);
  } catch (error) {
    next(error);
  }
}
