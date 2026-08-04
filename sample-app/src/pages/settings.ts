import { Dialog } from '../components/dialog';

export function SettingsPage() {
  return {
    title: 'Settings',
    dialog: Dialog({ title: 'Confirm', open: false, onClose: () => undefined }),
  };
}
