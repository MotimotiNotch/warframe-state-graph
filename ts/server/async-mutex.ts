// Go's sync.Mutex-per-store serializes concurrent handler goroutines around
// each store's file. Bun's event loop is single-threaded, but our operations
// are async (file I/O awaits), so two in-flight requests could still
// interleave a read-modify-write without an explicit queue — this is the TS
// equivalent of that mutex, not new behavior. Every *Store class (graph,
// glossary, standing, loadout, collection, wfcd cache) needs the identical
// promise-chain queue, so it lives here once rather than being copy-pasted
// per store the way Go's embedded sync.Mutex field is.
export class AsyncMutex {
  #tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(fn, fn);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
