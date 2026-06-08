// Simple CSS spinner with optional text

import './Spinner.css';

interface SpinnerProps {
  text?: string;
}

export function Spinner({ text }: SpinnerProps) {
  return (
    <span className="spinner-wrapper">
      <span className="spinner" />
      {text && <span className="spinner-text">{text}</span>}
    </span>
  );
}
