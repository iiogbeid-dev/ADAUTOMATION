import YAML from 'yaml';

const mockSteps = [
  {
    id: 'prep_context',
    action: 'collect_context',
    details: 'Gather existing user + host metadata before provisioning.'
  },
  {
    id: 'create_user',
    action: 'create_account',
    details: 'Create AD user based on service desk template.'
  },
  {
    id: 'generate_credentials',
    action: 'generate_ssh_keypair',
    details: 'Generate SSH key pair for low-trust hosts and store securely.'
  },
  {
    id: 'assign_groups',
    action: 'grant_group_membership',
    details: 'Add user to Tier1 service desk group and grant low-security host access.'
  }
];

const toYaml = (prompt) =>
  YAML.stringify({
    runbook: {
      name: 'demo_onboarding_runbook',
      createdAt: new Date().toISOString(),
      prompt
    },
    steps: mockSteps
  });

export const mockApi = {
  async generatePlan(prompt) {
    const yaml = toYaml(prompt);
    return {
      yaml,
      summary: 'Mock plan ready for review.',
      stepCount: mockSteps.length,
      structuredPlan: { runbook: { name: 'demo_onboarding_runbook', prompt }, steps: mockSteps },
      draft: true
    };
  },
  async executePlan(planYaml) {
    const now = Date.now();
    return {
      runId: `mock-${now}`,
      status: 'completed',
      logs: [
        { at: new Date(now).toISOString(), message: 'Mock execution started.' },
        { at: new Date(now + 1200).toISOString(), message: 'Simulating host connections...' },
        {
          at: new Date(now + 2400).toISOString(),
          message: 'Mock run completed without errors.'
        }
      ]
    };
  }
};
