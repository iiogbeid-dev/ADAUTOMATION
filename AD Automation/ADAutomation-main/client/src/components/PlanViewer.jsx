import '../styles/PlanViewer.css';

export function PlanViewer({ plan, onApprove, onReject, isExecuting }) {
  if (!plan) {
    return (
      <section className="plan-viewer plan-viewer--empty">
        <h2>Plan Preview</h2>
        <p>No plan generated yet. Submit a prompt to view the YAML runbook.</p>
      </section>
    );
  }

  return (
    <section className="plan-viewer">
      <header className="plan-header">
        <div>
          <h2>Plan Preview</h2>
          <p>{plan.summary || 'Review the generated runbook before approving.'}</p>
        </div>
        <span className="plan-meta">{plan.stepCount} steps</span>
      </header>
      <pre className="plan-yaml">
        <code>{plan.yaml}</code>
      </pre>
      <footer className="plan-actions">
        <button type="button" className="btn-danger" onClick={onReject} disabled={isExecuting}>
          Request Changes
        </button>
        <button type="button" className="btn-primary" onClick={onApprove} disabled={isExecuting}>
          {isExecuting ? 'Running…' : 'Approve & Execute'}
        </button>
      </footer>
    </section>
  );
}
