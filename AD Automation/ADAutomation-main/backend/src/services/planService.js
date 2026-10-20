import { performance } from 'node:perf_hooks';
import { auditService } from './auditService.js';
import { parseAndValidatePlanYaml, PlanValidationError } from '../utils/validatePlanYaml.js';
import { plannerRuntime } from './llm/llamaPlanner.js';
import { plannerConfig } from '../config/plannerConfig.js';

const templatingPattern = /(\{\{|\}\}|\{%|%\}|<<|>>)/;
const BASE_GROUPS = new Set(['Helpdesk', 'Workstations', 'ITAdmins']);

class PlanGenerationError extends Error {
  constructor(message, code = 'PLAN_GENERATION_FAILED', status = 500) {
    super(message);
    this.name = 'PlanGenerationError';
    this.code = code;
    this.status = status;
  }
}

function buildPlannerPrompt(prompt) {
  const trimmed = prompt.trim();

  return [
    'You will transform the following operator request into an automation plan.',
    'Respond with YAML that conforms exactly to the schema described in the system prompt.',
    'If the request is out of scope or unsafe, emit a single unsupported_request action with a reason.',
    'Operator request:',
    '```',
    trimmed,
    '```'
  ].join('\n');
}

/**
 * Service boundary for plan generation.
 * Replace the mock implementation with calls to your chosen LLM or planner.
 */
async function createPlan(prompt) {
  try {
    if (!prompt || typeof prompt !== 'string') {
      throw new PlanGenerationError('Prompt must be a non-empty string.', 'INVALID_PROMPT', 400);
    }

    const plannerPrompt = buildPlannerPrompt(prompt);
    const generationStart = performance.now();
    const planYaml = await plannerRuntime.generatePlanYaml(plannerPrompt);
    const generationMs = performance.now() - generationStart;
    console.log(`[planService] Plan YAML generated in ${generationMs.toFixed(0)} ms`);

    if (templatingPattern.test(planYaml)) {
      throw new PlanGenerationError(
        'Planner produced templated YAML. Please try again or rephrase the prompt.',
        'INVALID_YAML',
        422
      );
    }

    if (!planYaml) {
      throw new PlanGenerationError('Planner returned an empty response.');
    }
    const { parsed, metadata, actions } = parseAndValidatePlanYaml(planYaml);
    validateGroupReferences(actions);

    const summary = metadata.intent || 'Generated plan';
    const plan = {
      yaml: planYaml,
      summary,
      stepCount: actions.length,
      structuredPlan: parsed,
      draft: true,
      model: {
        name: plannerConfig.model.id,
        contextSize: plannerConfig.model.contextSize,
        temperature: plannerConfig.model.temperature
      },
      timings: {
        generationMs
      }
    };

    await auditService.recordEvent({
      type: 'PLAN_GENERATED',
      prompt,
      planYaml,
      parsedPlan: parsed,
      metadata,
      timings: {
        generationMs
      },
      createdAt: new Date().toISOString()
    });

    return plan;
  } catch (error) {
    await auditService.recordEvent({
      type: 'PLAN_GENERATION_ERROR',
      prompt,
      error: error.message,
      stack: error.stack,
      createdAt: new Date().toISOString()
    });

    if (error?.message === 'PLANNER_OUTPUT_CONTAINS_TEMPLATING') {
      throw new PlanGenerationError(
        'Planner produced templated YAML despite retrying. Please rephrase the prompt.',
        'INVALID_YAML',
        422
      );
    }

    if (error?.message === 'PLANNER_OUTPUT_INVALID_FORMAT') {
      throw new PlanGenerationError(
        'Planner did not follow the required YAML schema despite retrying. Please rephrase the prompt.',
        'INVALID_YAML',
        422
      );
    }

    if (error?.message === 'PLANNER_OUTPUT_INVALID_ACTION') {
      throw new PlanGenerationError(
        'Planner attempted to use a disallowed action even after retrying. Please rephrase the prompt.',
        'INVALID_YAML',
        422
      );
    }

    if (error?.message === 'PLANNER_OUTPUT_EMPTY') {
      throw new PlanGenerationError(
        'Planner returned an empty response after retries. Please rephrase the prompt.',
        'INVALID_YAML',
        422
      );
    }

    if (error instanceof PlanValidationError) {
      const supportedActions = plannerConfig.allowedActions.map((item) => item.name).join(', ');
      const friendlyMessage = [
        'The planner could not produce a valid runbook for this prompt.',
        error.message,
        `Supported actions: ${supportedActions}`,
        'Please rephrase or try a different request.'
      ]
        .filter(Boolean)
        .join(' ');

      throw new PlanGenerationError(friendlyMessage, error.code || 'PLAN_VALIDATION_FAILED', 422);
    }

    if (error instanceof PlanGenerationError) {
      throw error;
    }

    throw new PlanGenerationError(error.message || 'Planner failed to generate a valid plan.');
  }
}

export const planService = { createPlan };

function validateGroupReferences(actions) {
  const knownGroups = new Set(BASE_GROUPS);

  for (const action of actions) {
    const { action: actionName, parameters = {} } = action;

    if (actionName === 'create_group' && parameters.group) {
      knownGroups.add(parameters.group);
      continue;
    }

    if (actionName === 'add_user_to_group' && parameters.group) {
      assertKnownGroup(parameters.group, actionName, knownGroups);
    }

    if (actionName === 'remove_user_from_group' && parameters.group) {
      assertKnownGroup(parameters.group, actionName, knownGroups);
    }

    if (actionName === 'create_user' && Array.isArray(parameters.groups)) {
      for (const groupName of parameters.groups) {
        assertKnownGroup(groupName, actionName, knownGroups);
      }
    }
  }
}

function assertKnownGroup(groupName, actionName, knownGroups) {
  if (!groupName || knownGroups.has(groupName)) return;

  throw new PlanGenerationError(
    `Action "${actionName}" references unknown group "${groupName}". Only existing groups (${Array.from(
      knownGroups
    ).join(', ')}) may be used, or add a create_group action first.`,
    'INVALID_GROUP',
    422
  );
}
