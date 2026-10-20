import { useState } from 'react';
import '../styles/ChatPanel.css';

export function ChatPanel({ onSubmit, isGenerating, conversation }) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(prompt.trim());
    setPrompt('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <h2>Prompt Builder</h2>
          <p>Describe the automation you want to run. Keep it high-level and clear.</p>
        </div>
        <span className={`status-pill ${isGenerating ? 'status-loading' : ''}`}>
          {isGenerating ? 'Generating plan…' : 'Ready'}
        </span>
      </div>
      <div className="chat-history">
        {conversation.length === 0 ? (
          <div className="chat-empty">
            <p>
              Try something like:
              <br />
              <code>
                Onboard a new service desk employee, generate SSH credentials, and add them to the
                Tier 1 group.
              </code>
            </p>
          </div>
        ) : (
          conversation.map((entry) => (
            <article key={entry.id} className={`chat-entry chat-${entry.role}`}>
              <header>{entry.role === 'user' ? 'You' : 'Planner'}</header>
              <p>{entry.content}</p>
            </article>
          ))
        )}
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea
          rows={4}
          placeholder="Describe the automation task you want to run…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="chat-actions">
          <button type="submit" disabled={isGenerating}>
            {isGenerating ? 'Working…' : 'Generate Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
