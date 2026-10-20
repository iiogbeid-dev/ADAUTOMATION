import { useMemo, useState } from 'react';
import './styles/App.css';
import { PinGate } from './components/PinGate.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { PlanViewer } from './components/PlanViewer.jsx';
import { ExecutionConsole } from './components/ExecutionConsole.jsx';
import { useAutomationApi } from './hooks/useAutomationApi.js';

const DEFAULT_PIN = import.meta.env.VITE_APP_ACCESS_PIN || '227470';
const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function App() {
  const [pin, setPin] = useState('');
  const [conversation, setConversation] = useState([]);
  const [plan, setPlan] = useState(null);
  const [execution, setExecution] = useState(null);
  const [lastAction, setLastAction] = useState('');

  const { requestPlan, runPlan, isGenerating, isExecuting, error, resetError } =
    useAutomationApi(pin);

  const unlocked = useMemo(() => pin?.length >= 4, [pin]);

  const handlePrompt = async (prompt) => {
    try {
      resetError();
      setConversation((prev) => [...prev, { id: createId(), role: 'user', content: prompt }]);
      const generatedPlan = await requestPlan(prompt);
      setPlan(generatedPlan);
      setExecution(null);
      setLastAction('plan_generated');
      setConversation((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          content: generatedPlan.summary || 'Plan ready for your approval.'
        }
      ]);
    } catch (err) {
      setLastAction('plan_error');
      setConversation((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          content:
            err?.message ||
            'I could not generate a runbook for that request. Please adjust your prompt and try again.'
        }
      ]);
    }
  };

  const handleApprove = async () => {
    if (!plan?.yaml) return;
    try {
      const result = await runPlan(plan.yaml);
      setExecution(result);
      setLastAction('execution_started');
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = () => {
    setLastAction('plan_rejected');
    setPlan(null);
    setExecution(null);
  };

  if (!unlocked) {
    return <PinGate correctPin={DEFAULT_PIN} onUnlock={setPin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div>
          <h1>AI Runbook Executor</h1>
          <p>
            Prototype workspace for translating natural-language requests into audited automation
            runs.
          </p>
        </div>
        <div className="topbar-meta">
          <span className="meta-chip">PIN: ****{pin.slice(-2)}</span>
          <span className="meta-chip">Version {__APP_VERSION__}</span>
        </div>
      </header>
      {error ? (
        <div className="app-banner app-banner--error">
          <span>{error.message || 'Something went wrong.'}</span>
          <button onClick={resetError}>Dismiss</button>
        </div>
      ) : null}
      {lastAction === 'plan_rejected' ? (
        <div className="app-banner app-banner--warning">
          <span>Plan discarded. Submit a new prompt or adjust your request.</span>
          <button onClick={() => setLastAction('')}>Dismiss</button>
        </div>
      ) : null}
      {lastAction === 'plan_error' ? (
        <div className="app-banner app-banner--warning">
          <span>Could not generate a plan for that request. Try another prompt.</span>
          <button onClick={() => setLastAction('')}>Dismiss</button>
        </div>
      ) : null}
      <main className="app-content">
        <section className="app-main">
          <ChatPanel
            conversation={conversation}
            onSubmit={handlePrompt}
            isGenerating={isGenerating}
          />
        </section>
        <section className="app-lower">
          <PlanViewer plan={plan} onApprove={handleApprove} onReject={handleReject} isExecuting={isExecuting} />
          <ExecutionConsole execution={execution} isExecuting={isExecuting} />
        </section>
      </main>
    </div>
  );
}
