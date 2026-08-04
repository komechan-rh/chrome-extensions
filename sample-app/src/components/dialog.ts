export interface DialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
}

export function Dialog({ title, open, onClose }: DialogProps) {
  if (!open) return null;

  return {
    tag: 'dialog',
    role: 'dialog',
    ariaLabel: title,
    onClose,
  };
}
