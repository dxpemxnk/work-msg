export class SerialCommandQueue<TCommand extends { clientMessageId: string }, TResult> {
  private tail: Promise<void> = Promise.resolve();
  private readonly active = new Map<string, Promise<TResult>>();

  enqueue(command: TCommand, execute: (command: TCommand) => Promise<TResult>): Promise<TResult> {
    const existing = this.active.get(command.clientMessageId);
    if (existing) return existing;

    const run = this.tail.then(() => execute(command));
    this.tail = run.then(() => undefined, () => undefined);
    this.active.set(command.clientMessageId, run);
    const release = () => {
      if (this.active.get(command.clientMessageId) === run) this.active.delete(command.clientMessageId);
    };
    void run.then(release, release);
    return run;
  }
}
