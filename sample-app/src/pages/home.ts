import { Button } from '../components';

export function HomePage() {
  return {
    title: 'Home',
    actions: [Button({ label: 'Reload' })],
  };
}
