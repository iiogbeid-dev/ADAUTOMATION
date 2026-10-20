import { useState } from 'react';
import '../styles/PinGate.css';

export function PinGate({ correctPin, onUnlock }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (input.trim() === String(correctPin)) {
      onUnlock(String(correctPin));
      setInput('');
      setError('');
    } else {
      setError('Incorrect PIN. Try again or check your .env configuration.');
    }
  };

  return (
    <div className="pin-gate">
      <div className="pin-card">
        <h1>AI Runbook Lab</h1>
        <p className="pin-subtitle">Enter the access PIN to unlock the interface.</p>
        <form onSubmit={handleSubmit} className="pin-form">
          <input
            inputMode="numeric"
            autoFocus
            placeholder="Enter PIN"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.replace(/\D+/g, '').slice(0, 6));
              setError('');
            }}
          />
          <button type="submit">Unlock</button>
        </form>
        {error ? <p className="pin-error">{error}</p> : null}
        <p className="pin-hint">Default PIN: 227470 (configurable in .env files)</p>
      </div>
    </div>
  );
}
