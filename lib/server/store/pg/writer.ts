/**
 * Background writer for single-document rows (config, QA): one write at a
 * time, and changes that arrive while a write is running collapse into one
 * follow-up write of the newest state. `push` resolves once the state it was
 * given (or a newer one) is saved; failures are reported, never thrown, so a
 * caller in a synchronous onChange hook cannot cause an unhandled rejection.
 */
export class LatestWriter {
  private running?: Promise<void>;
  private next?: () => string;

  constructor(
    private readonly write: (body: string) => Promise<unknown>,
    private readonly onError: (err: unknown) => void,
  ) {}

  /** `body` is called when the write starts, so it serialises the newest state. */
  push(body: () => string): Promise<void> {
    this.next = body;
    this.running ??= this.drain();
    return this.running;
  }

  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async drain(): Promise<void> {
    while (this.next) {
      const body = this.next;
      this.next = undefined;
      try {
        await this.write(body());
      } catch (err) {
        this.onError(err);
      }
    }
    this.running = undefined;
  }
}
