// A single pending action; cancellation never calls the operation.
export function createActionDialogController(publish) {
  let current = null;
  let busy = false;
  function emit(error = '') { publish(current ? { ...current.options, busy, error } : null); }
  return {
    request(options, action) {
      if (current) return Promise.resolve(false);
      return new Promise(resolve => { current = { options, action, resolve }; emit(); });
    },
    cancel() {
      if (!current || busy) return;
      const pending = current; current = null; emit(); pending.resolve(false);
    },
    async confirm(value = '') {
      if (!current || busy) return;
      const pending = current;
      busy = true; emit();
      try {
        const result = await pending.action(value);
        if (result === false) throw new Error('Action not completed');
        current = null; busy = false; emit(); pending.resolve(true);
      } catch {
        busy = false; emit(pending.options.errorMessage || 'Não foi possível concluir a ação. Tente novamente.');
      }
    },
    dispose() { const pending = current; current = null; busy = false; pending?.resolve(false); }
  };
}
