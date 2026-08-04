import '../styles/content.css';
import { debugLog } from './debug';
import { createPrReviewSync } from './github-pr-review';
import { createNavigationWatcher } from './navigation';

/** 二重注入されても observer を重複登録しないための目印。 */
const INSTALL_FLAG = '__githubViewedSyncInstalled';

function bootstrap(): void {
  const scope = globalThis as typeof globalThis & Record<string, boolean | undefined>;
  if (scope[INSTALL_FLAG] === true) {
    debugLog('already installed; skip bootstrap');
    return;
  }
  scope[INSTALL_FLAG] = true;

  const sync = createPrReviewSync();
  const watcher = createNavigationWatcher(sync);
  watcher.start();
}

bootstrap();
