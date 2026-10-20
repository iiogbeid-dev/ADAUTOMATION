import crypto from 'node:crypto';
import { auditService } from './auditService.js';
import { parseAndValidatePlanYaml } from '../utils/validatePlanYaml.js';
import { actionHandlers } from './execution/actions.js';

function createLogger(runId, metadata) {
  const logs = [];
  const append = (message) => {
    logs.push({ at: new Date().toISOString(), message });
  };

  append(`Execution run ${runId} started.`);
  if (metadata?.intent) {
    append(`Intent: ${metadata.intent}`);
  }

  return { logs, append };
}

async function executePlan({ planYaml, metadata }) {
  const runId = crypto.randomUUID();
  let status = 'completed';

  let validatedPlan;
  try {
    validatedPlan = parseAndValidatePlanYaml(planYaml);
  } catch (error) {
    await auditService.recordEvent({
      type: 'PLAN_EXECUTION_FAILED',
      runId,
      planYaml,
      metadata,
      createdAt: new Date().toISOString(),
      error: error.message
    });
    throw error;
  }

  const executorMetadata = {
    ...metadata,
    planIntent: validatedPlan.metadata.intent,
    planConfidence: validatedPlan.metadata.confidence
  };

  const { logs, append } = createLogger(runId, validatedPlan.metadata);

  for (const step of validatedPlan.actions) {
    const { action, parameters } = step;

    if (action === 'unsupported_request') {
      append(`Unsupported request: ${parameters.reason}`);
      status = 'failed';
      break;
    }

    const handler = actionHandlers[action];
    if (!handler) {
      append(`No handler implemented for action "${action}". Aborting.`);
      status = 'failed';
      break;
    }

    append(`Starting action "${action}".`);
    try {
      await handler(parameters, logs);
      append(`Action "${action}" completed.`);
    } catch (error) {
      status = 'failed';
      append(`Action "${action}" failed: ${error.message}`);
      if (error.stdout?.trim()) {
        append(`stdout: ${error.stdout.trim()}`);
      }
      if (error.stderr?.trim()) {
        append(`stderr: ${error.stderr.trim()}`);
      }
      break;
    }
  }

  append(`Execution run ${runId} finished with status ${status}.`);

  await auditService.recordEvent({
    type: 'PLAN_EXECUTED',
    runId,
    planYaml,
    metadata: executorMetadata,
    logs,
    createdAt: new Date().toISOString(),
    result: status
  });

  return {
    runId,
    status,
    logs,
    metadata: executorMetadata
  };
}

export const executionService = { executePlan };
