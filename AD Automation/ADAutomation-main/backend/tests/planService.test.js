import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerRuntime } from '../src/services/llm/llamaPlanner.js';
import { planService } from '../src/services/planService.js';

test('planService.createPlan returns validated plan using planner output', async (t) => {
  const prompt = 'Onboard a new service desk employee.';
  const sampleYaml = `
version: "1.0"
metadata:
  intent: onboarding_users
  source_prompt: ${prompt}
  confidence: 0.9
actions:
  - action: create_user
    parameters:
      username: service.desk
      ou: OU=Users,DC=EXAMPLE,DC=LOCAL
      password: "Welcome123!"
  - action: add_user_to_group
    parameters:
      username: service.desk
      group: Helpdesk
`.trim();

  t.mock.method(plannerRuntime, 'generatePlanYaml', async () => sampleYaml);

  const plan = await planService.createPlan(prompt);

  assert.equal(plan.stepCount, 2);
  assert.equal(plan.structuredPlan.metadata.intent, 'onboarding_users');
  assert.equal(plan.structuredPlan.actions[0].action, 'create_user');
  assert.ok(plan.yaml.startsWith('version: "1.0"'));
});
