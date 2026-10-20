import { useCallback, useState } from 'react';
import { executePlan, generatePlan } from '../services/api.js';

export function useAutomationApi(pin) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState(null);

  const requestPlan = useCallback(
    async (prompt) => {
      try {
        setError(null);
        setIsGenerating(true);
        const plan = await generatePlan(prompt, pin);
        return plan;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [pin]
  );

  const runPlan = useCallback(
    async (planYaml) => {
      try {
        setError(null);
        setIsExecuting(true);
        const execution = await executePlan(planYaml, pin);
        return execution;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsExecuting(false);
      }
    },
    [pin]
  );

  return {
    requestPlan,
    runPlan,
    isGenerating,
    isExecuting,
    error,
    resetError: () => setError(null)
  };
}
