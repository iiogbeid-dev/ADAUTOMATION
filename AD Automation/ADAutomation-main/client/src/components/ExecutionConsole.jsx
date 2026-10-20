import '../styles/ExecutionConsole.css';

export function ExecutionConsole({ execution, isExecuting }) {
  return (
    <section className="execution-console">
      <header className="execution-header">
        <div>
          <h2>Execution Console</h2>
          <p>Monitor the automation run in real time.</p>
        </div>
        <span className={`status-pill ${isExecuting ? 'status-loading' : ''}`}>
          {isExecuting ? 'Running…' : execution ? execution.status : 'Idle'}
        </span>
      </header>
      <div className="execution-log">
        {execution?.logs?.length ? (
          execution.logs.map((entry) => (
            <div key={`${entry.at}-${entry.message}`} className="log-line">
              <span className="log-time">{new Date(entry.at).toLocaleTimeString()}</span>
              <span className="log-text">{entry.message}</span>
            </div>
          ))
        ) : (
          <div className="execution-empty">
            {isExecuting ? 'Waiting for output…' : 'No execution logs yet.'}
          </div>
        )}
      </div>
      {execution?.runId ? (
        <footer className="execution-footer">
          <span>Run ID:</span>
          <code>{execution.runId}</code>
        </footer>
      ) : null}
    </section>
  );
}
