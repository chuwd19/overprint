// Auto-pick off the main thread, so the page stays live while it searches.
import { autoPickInks } from './separate.js';
import { AUTO_INKS } from './inks.js';

self.onmessage = (e) => {
  const { id, samples, paper, count } = e.data;
  const { inks, error } = autoPickInks(AUTO_INKS, samples, paper, count);
  self.postMessage({ id, inks, error });
};
