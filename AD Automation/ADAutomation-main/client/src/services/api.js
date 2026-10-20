import { mockApi } from './mockApi.js';

const inferDevApiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? inferDevApiBase() : '');
const USE_MOCKS = String(import.meta.env.VITE_USE_MOCKS || '').toLowerCase() === 'true';

async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error.message || response.statusText;
    const err = new Error(message);
    err.status = response.status;
    err.payload = error;
    throw err;
  }

  return response.json();
}

export async function generatePlan(prompt, pin) {
  if (!prompt) {
    throw new Error('Prompt is required.');
  }

  const endpoint = `${API_BASE}/api/prompts/plan`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ui-pin': pin
      },
      body: JSON.stringify({ prompt })
    });

    return await handleResponse(response);
  } catch (error) {
    if (USE_MOCKS) {
      console.warn('[api] Falling back to mock plan generator.', error);
      return mockApi.generatePlan(prompt);
    }
    throw error;
  }
}

export async function executePlan(planYaml, pin) {
  if (!planYaml) {
    throw new Error('Plan YAML is required.');
  }

  const endpoint = `${API_BASE}/api/executions/run`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ui-pin': pin
      },
      body: JSON.stringify({ planYaml, metadata: { source: 'ui' } })
    });

    return await handleResponse(response);
  } catch (error) {
    if (USE_MOCKS) {
      console.warn('[api] Falling back to mock executor.', error);
      return mockApi.executePlan(planYaml);
    }
    throw error;
  }
}
