import YAML from 'yaml';

const defaultSteps = [
  {
    id: 'prep_context',
    action: 'collect_context',
    description: 'Gather current state from identity provider and inventory services.'
  },
  {
    id: 'create_user',
    action: 'create_account',
    params: {
      system: 'active_directory',
      template: 'service_desk_new_hire'
    }
  },
  {
    id: 'generate_credentials',
    action: 'generate_ssh_keypair',
    params: {
      targets: ['jump-host-1', 'jump-host-2']
    }
  },
  {
    id: 'assign_groups',
    action: 'grant_group_membership',
    params: {
      groups: ['Tier1-ServiceDesk', 'LowSec-SSH']
    }
  }
];

export function buildMockPlan(prompt) {
  const plan = {
    runbook: {
      name: 'demo_onboarding_runbook',
      requestedBy: 'demo-user',
      createdAt: new Date().toISOString(),
      prompt
    },
    steps: defaultSteps
  };

  return {
    yaml: YAML.stringify(plan),
    summary: 'Generated mock onboarding runbook with identity, credential, and access steps.',
    stepCount: plan.steps.length,
    draft: true,
    // Give the student a deterministic shape to target in their UI & tests.
    structuredPlan: plan
  };
}
