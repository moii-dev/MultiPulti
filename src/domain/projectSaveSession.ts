import type { Project } from '../types/editor';

/** One editor session owns its baseline and serializes all revisions. */
export function createProjectSaveSession(initial: Project, save: (project: Project) => Promise<void>) {
  const fingerprint = (p: Project) => JSON.stringify([p.frames, p.currentFrameId, p.fps]);
  let saved = fingerprint(initial);
  let tail = Promise.resolve();
  let pending = 0;
  return {
    dirty: (project: Project) => pending > 0 || fingerprint(project) !== saved,
    flush(project: Project) {
      if (project.id !== initial.id) return Promise.reject(new Error('Нельзя сохранить другой проект в этой сессии'));
      const snapshot = structuredClone(project);
      pending++;
      const result = tail.catch(() => {}).then(async () => {
        const revision = fingerprint(snapshot);
        if (revision === saved) return;
        await save({ ...snapshot, updatedAt: Date.now() });
        saved = revision;
      });
      const settled = result.finally(() => { pending--; });
      tail = settled;
      return settled;
    },
  };
}
