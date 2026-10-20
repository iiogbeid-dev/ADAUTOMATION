import { executionService } from '../services/executionService.js';

export async function runExecution(req, res, next) {
  try {
    const { planYaml, metadata } = req.body || {};

    if (!planYaml) {
      return res.status(400).json({
        error: 'PLAN_REQUIRED',
        message: 'Submit the YAML plan to execute.'
      });
    }

    const execution = await executionService.executePlan({
      planYaml,
      metadata
    });

    res.json(execution);
  } catch (error) {
    next(error);
  }
}
