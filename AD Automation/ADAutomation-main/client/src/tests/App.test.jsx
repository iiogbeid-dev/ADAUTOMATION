import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App.jsx';

describe('App', () => {
  it('locks the UI behind a PIN gate', async () => {
    render(<App />);

    expect(screen.getByText(/AI Runbook Lab/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/enter pin/i), '227470');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));

    expect(
      await screen.findByText(/Prototype workspace for translating natural-language/i)
    ).toBeInTheDocument();
  });
});
