export interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  onClick?: () => void;
}

export function Button({ label, variant = 'primary', disabled = false, onClick }: ButtonProps) {
  return {
    tag: 'button',
    className: `btn btn--${variant}`,
    disabled,
    textContent: label,
    onClick,
  };
}
