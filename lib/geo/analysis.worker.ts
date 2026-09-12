import { readPair } from './cog.ts';
self.onmessage = async ({ data }) => {
  try {
    const pair = await readPair(
      data.before,
      data.after,
      data.bbox,
      (message) => self.postMessage({ type: 'progress', message }),
      AbortSignal.timeout(180000),
    );
    self.postMessage({ type: 'result', pair });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
