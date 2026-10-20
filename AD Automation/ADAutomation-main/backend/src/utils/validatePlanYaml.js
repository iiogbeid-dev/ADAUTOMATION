import YAML from 'yaml';
import { plannerConfig } from '../config/plannerConfig.js';

class PlanValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlanValidationError';
    this.code = code;
    this.details = details;
  }
}

const actionMap = plannerConfig.allowedActions.reduce((map, action) => {
  map.set(action.name, action);
  return map;
}, new Map());

function assertObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlanValidationError(code, message);
  }
}

function validateArray(value, code, message) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PlanValidationError(code, message);
  }
}

function validateBoolean(value, code, message) {
  if (typeof value !== 'boolean') {
    throw new PlanValidationError(code, message);
  }
}

function validateString(value, code, message) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlanValidationError(code, message);
  }
}

function ensureRequiredParams(action, parameters) {
  const missing = action.required.filter((key) => {
    const value = parameters[key];
    return value === undefined || value === null || (typeof value === 'string' && !value.trim());
  });

  if (missing.length) {
    throw new PlanValidationError('MISSING_PARAMETERS', `Action "${action.name}" requires ${missing.join(', ')}`, {
      action: action.name,
      missing
    });
  }
}

function ensureNoUnexpectedParams(action, parameters) {
  const allowedKeys = new Set([...action.required, ...action.optional]);
  const unexpected = Object.keys(parameters).filter((key) => !allowedKeys.has(key));

  if (unexpected.length) {
    throw new PlanValidationError(
      'UNSUPPORTED_PARAMETER',
      `Action "${action.name}" includes unsupported parameters: ${unexpected.join(', ')}`,
      { action: action.name, unexpected }
    );
  }
}

function enforceParameterShapes(actionName, parameters) {
  switch (actionName) {
    case 'create_user':
      if (parameters.groups !== undefined) {
        validateArray(parameters.groups, 'INVALID_GROUPS', 'create_user.groups must be a non-empty list of group names.');
        parameters.groups.forEach((group, index) =>
          validateString(group, 'INVALID_GROUP_NAME', `Group name at index ${index} must be a non-empty string.`)
        );
      }
      break;
    case 'add_user_to_group':
    case 'remove_user_from_group':
      validateString(parameters.username, 'INVALID_USERNAME', 'username must be a non-empty string.');
      validateString(parameters.group, 'INVALID_GROUP', 'group must be a non-empty string.');
      break;
    case 'create_group':
      if (parameters.scope) {
        const allowedScopes = ['Global', 'DomainLocal', 'Universal'];
        if (!allowedScopes.includes(parameters.scope)) {
          throw new PlanValidationError(
            'INVALID_GROUP_SCOPE',
            `create_group.scope must be one of ${allowedScopes.join(', ')}`
          );
        }
      }
      break;
    case 'apply_gpo':
      validateArray(parameters.target_ous, 'INVALID_TARGET_OUS', 'apply_gpo.target_ous must be a list of OU strings.');
      parameters.target_ous.forEach((ou, index) =>
        validateString(ou, 'INVALID_OU', `apply_gpo.target_ous[${index}] must be a non-empty string.`)
      );
      if (parameters.policy_settings !== undefined) {
        assertObject(
          parameters.policy_settings,
          'INVALID_POLICY_SETTINGS',
          'apply_gpo.policy_settings must be a key/value map.'
        );
      }
      if (parameters.enforcement) {
        const allowed = ['Enabled', 'Disabled', 'Enforced'];
        if (!allowed.includes(parameters.enforcement)) {
          throw new PlanValidationError(
            'INVALID_ENFORCEMENT',
            `apply_gpo.enforcement must be one of ${allowed.join(', ')}`
          );
        }
      }
      break;
    case 'reset_password':
      validateString(parameters.new_password, 'INVALID_PASSWORD', 'reset_password.new_password must be a string.');
      if (parameters.force_password_change !== undefined) {
        validateBoolean(
          parameters.force_password_change,
          'INVALID_FORCE_PASSWORD_CHANGE',
          'reset_password.force_password_change must be a boolean.'
        );
      }
      break;
    default:
      break;
  }
}

export function parseAndValidatePlanYaml(planYaml) {
  let parsed;
  try {
    parsed = YAML.parse(planYaml);
  } catch (error) {
    throw new PlanValidationError('INVALID_YAML', `Planner returned invalid YAML: ${error.message}`);
  }

  assertObject(parsed, 'INVALID_PLAN', 'Planner response must be a YAML object.');

  const { version, metadata, actions, ...extraFields } = parsed;

  if (version !== '1.0') {
    throw new PlanValidationError('UNSUPPORTED_VERSION', 'Only plan version "1.0" is supported.');
  }

  assertObject(metadata, 'INVALID_METADATA', 'metadata must be an object.');

  const requiredMetadata = ['intent', 'source_prompt', 'confidence'];
  requiredMetadata.forEach((field) => {
    if (!(field in metadata)) {
      throw new PlanValidationError('MISSING_METADATA', `metadata.${field} is required.`);
    }
  });

  validateString(metadata.intent, 'INVALID_INTENT', 'metadata.intent must be a non-empty string.');
  validateString(metadata.source_prompt, 'INVALID_SOURCE_PROMPT', 'metadata.source_prompt must be a non-empty string.');

  const confidence = Number(metadata.confidence);
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new PlanValidationError(
      'INVALID_CONFIDENCE',
      'metadata.confidence must be a numeric value between 0 and 1.'
    );
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    throw new PlanValidationError('INVALID_ACTIONS', 'actions must be a non-empty list.');
  }

  const validatedActions = actions.map((action, index) => {
    assertObject(action, 'INVALID_ACTION_ITEM', `actions[${index}] must be an object.`);
    const { action: actionName, parameters } = action;
    validateString(actionName, 'INVALID_ACTION_NAME', `actions[${index}].action must be a non-empty string.`);

    if (actionName === 'unsupported_request') {
      assertObject(parameters, 'UNSUPPORTED_REASON', 'unsupported_request must include parameters.reason');
      validateString(parameters.reason, 'UNSUPPORTED_REASON', 'parameters.reason must be a non-empty string.');
      return action;
    }

    const definition = actionMap.get(actionName);
    if (!definition) {
      throw new PlanValidationError('UNAUTHORIZED_ACTION', `Action "${actionName}" is not in the allow list.`);
    }

    assertObject(
      parameters,
      'INVALID_PARAMETERS',
      `actions[${index}].parameters must be an object with keys for ${definition.required.join(', ')}`
    );

    ensureRequiredParams(definition, parameters);
    ensureNoUnexpectedParams(definition, parameters);
    enforceParameterShapes(actionName, parameters);

    return action;
  });

  return {
    parsed: { ...parsed, actions: validatedActions },
    metadata,
    actions: validatedActions,
    extraFields
  };
}

export { PlanValidationError };
