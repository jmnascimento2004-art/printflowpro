function cancelRenderTask(task) {
  try {
    task.cancel();
  } catch {
    // Cancellation is best-effort because PDF.js may have already completed it.
  }
}

function destroyLoadingTask(task) {
  try {
    void Promise.resolve(task.destroy()).catch(() => undefined);
  } catch {
    // Destruction is best-effort because PDF.js may have already released it.
  }
}

export async function blobToPdfData(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer.slice(0));
}

export function hasPdfSignature(data) {
  return data.length >= 5
    && data[0] === 0x25
    && data[1] === 0x50
    && data[2] === 0x44
    && data[3] === 0x46
    && data[4] === 0x2d;
}

export function createPdfPreviewRunController() {
  let generation = 0;
  let loadingTask = null;
  const renderTasks = new Set();

  const cancelTasks = () => {
    for (const task of renderTasks) cancelRenderTask(task);
    renderTasks.clear();

    if (loadingTask) {
      destroyLoadingTask(loadingTask);
      loadingTask = null;
    }
  };

  return {
    begin() {
      generation += 1;
      cancelTasks();
      return generation;
    },

    isCurrent(candidate) {
      return candidate === generation;
    },

    setLoadingTask(candidate, task) {
      if (candidate !== generation) {
        destroyLoadingTask(task);
        return false;
      }

      if (loadingTask && loadingTask !== task) destroyLoadingTask(loadingTask);
      loadingTask = task;
      return true;
    },

    addRenderTask(candidate, task) {
      if (candidate !== generation) {
        cancelRenderTask(task);
        return false;
      }

      renderTasks.add(task);
      return true;
    },

    removeRenderTask(task) {
      renderTasks.delete(task);
    },

    cancel(candidate) {
      if (candidate !== generation) return;
      generation += 1;
      cancelTasks();
    }
  };
}
