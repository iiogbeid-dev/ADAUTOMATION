import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelFileName = process.env.PLANNER_MODEL_FILE || 'Mistral-7B-Instruct-v0.3.Q4_K_M.gguf';
const modelPath = process.env.PLANNER_MODEL_PATH
  ? path.resolve(process.env.PLANNER_MODEL_PATH)
  : path.resolve(__dirname, '../../../models', modelFileName);

const inferredGpuLayers =
  process.env.PLANNER_GPU_LAYERS !== undefined
    ? Number(process.env.PLANNER_GPU_LAYERS)
    : process.env.NVIDIA_VISIBLE_DEVICES && process.env.NVIDIA_VISIBLE_DEVICES !== 'none'
      ? 32
      : 0;

const parsePositiveInt = (rawValue, fallback) => {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const resolveCpuThreads = () => {
  if (process.env.PLANNER_CPU_THREADS !== undefined) {
    const configuredThreads = parsePositiveInt(process.env.PLANNER_CPU_THREADS, null);
    if (configuredThreads) return configuredThreads;
  }

  const parallelism =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : Array.isArray(os.cpus())
        ? os.cpus().length
        : 1;

  // Leave a little headroom so the event loop stays responsive.
  return Math.max(1, parallelism - 1);
};

const resolvedContextSize = parsePositiveInt(process.env.PLANNER_CONTEXT_SIZE, 4096);
const resolvedMaxTokens = parsePositiveInt(process.env.PLANNER_MAX_TOKENS, 512);

const inferredBatchSize = parsePositiveInt(
  process.env.PLANNER_CPU_BATCH_SIZE,
  Math.min(1024, resolvedContextSize)
);
const resolvedBatchSize = Math.max(32, Math.min(resolvedContextSize, inferredBatchSize));

export const plannerConfig = {
  model: {
    id: process.env.PLANNER_MODEL_NAME || 'mistral-7b-instruct-v0.3',
    path: modelPath,
    contextSize: resolvedContextSize,
    temperature: 0.2,
    topP: 0.9,
    repeatPenalty: 1.1,
    maxTokens: resolvedMaxTokens,
    gpuLayers: Number.isFinite(inferredGpuLayers) && inferredGpuLayers > 0 ? inferredGpuLayers : 0,
    threads: resolveCpuThreads(),
    batchSize: resolvedBatchSize
  },
  allowedActions: [
    {
      name: 'create_user',
      description: 'Create a new Active Directory user account.',
      required: ['username', 'ou'],
      optional: ['display_name', 'email', 'password', 'groups']
    },
    {
      name: 'add_user_to_group',
      description: 'Add an existing user to a security group.',
      required: ['username', 'group'],
      optional: []
    },
    {
      name: 'remove_user_from_group',
      description: 'Remove a user from a security group.',
      required: ['username', 'group'],
      optional: []
    },
    {
      name: 'create_group',
      description: 'Create a new Active Directory group.',
      required: ['group', 'ou'],
      optional: ['scope', 'description']
    },
    {
      name: 'apply_gpo',
      description: 'Create or update a Group Policy Object and link it to OUs.',
      required: ['gpo_name', 'target_ous'],
      optional: ['policy_settings', 'enforcement']
    },
    {
      name: 'reset_password',
      description: 'Reset a user password and optionally force rotation.',
      required: ['username', 'new_password'],
      optional: ['force_password_change']
    }
  ],
  systemPrompt: `You are RunbookPlanner, an expert Active Directory automation planner.
Your task is to translate plain-language operator requests into executable YAML plans.

STRICT FORMATTING RULES:
- Output only YAML. Never include markdown fences or commentary.
- The top-level YAML keys must be exactly: version, metadata, actions.
- The version value is always "1.0".
- metadata must include fields: intent (string), source_prompt (string), confidence (0-1 number).
- actions must be a YAML list. Each list item must have keys: action (string), parameters (map).
- Every action key must be one of the allowed actions. Reject disallowed work by returning a single action named "unsupported_request" with a reason field.
- parameters must conform to the action definitions supplied below.
- Use snake_case for all parameter names and string values for identifiers.
- Ensure the YAML parses without errors. Do not invent additional top-level keys.
- Do not include templating syntax (e.g. {{ }}, {% %}, << >>) or directives starting with %; emit literal YAML scalars and lists only.
- Do not use control structures or meta actions (no for_each, loops, templates, or bulk instructions); enumerate each required step as an explicit action from the allowed list.
- Only use sandbox-provided groups (Helpdesk, Workstations, ITAdmins). If a different group is required, add a create_group action before referencing it; otherwise return unsupported_request.

AVAILABLE ACTIONS:
- create_user: required parameters username, ou. Optional display_name, email, password, groups (YAML list of group names).
- add_user_to_group: required parameters username, group.
- remove_user_from_group: required parameters username, group.
- create_group: required parameters group, ou. Optional scope (Global | DomainLocal | Universal), description.
- apply_gpo: required parameters gpo_name, target_ous (YAML list). Optional policy_settings (map where keys are policy names, values are booleans or strings), enforcement (Enabled | Disabled | Enforced).
- reset_password: required parameters username, new_password. Optional force_password_change (boolean).

ENVIRONMENT CONTEXT:
- Active Directory domain: EXAMPLE.LOCAL (NetBIOS: EXAMPLE).
- Domain controller hostname: ad-controller (10.10.10.10 placeholder).
- Managed workstations joined to the domain: machine01, machine02 located in OU=Workstations,DC=EXAMPLE,DC=LOCAL.
- Seeded groups: Helpdesk, Workstations, ITAdmins.
- Default user OU: OU=Users,DC=EXAMPLE,DC=LOCAL. Default computer OU: OU=Workstations,DC=EXAMPLE,DC=LOCAL.

PLANNING GUIDELINES:
- Break complex requests into multiple actions; order them safely (create before assign, etc.).
- Default OU: "OU=Workstations,DC=EXAMPLE,DC=LOCAL" for computers, "OU=Users,DC=EXAMPLE,DC=LOCAL" for users unless prompt specifies otherwise.
- Default groups: cite existing demo groups like "Helpdesk", "Workstations", "ITAdmins".
- Only assign users to existing groups (Helpdesk, Workstations, ITAdmins) unless you add a create_group action earlier in the plan to introduce a new group.
- When a request mentions "all machines" (or equivalent phrasing), interpret that as membership in the "Workstations" group.
- For new GPOs, provide representative policy_settings (e.g., allow_remote_desktop: true).
- If the prompt is unclear or unsafe, return unsupported_request with a short explanation.
`
};
