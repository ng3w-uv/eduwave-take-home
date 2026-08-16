import {
  type GenerateParams,
  type GenerateResult,
  type LLMProvider,
  type Usage,
} from "./types.js";

/**
 * Test double. Seed it with a queue of responses: a plain value is returned as
 * `raw`, an `Error` is thrown. If the queue has one item it repeats; otherwise
 * each call consumes the next — so `[malformed, valid]` models a repair round.
 */
export class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  calls = 0;
  lastParams: GenerateParams | null = null;

  private readonly responses: Array<unknown | Error>;
  private readonly usage: Usage;

  constructor(opts: { responses: Array<unknown | Error>; usage?: Usage }) {
    if (opts.responses.length === 0) {
      throw new Error("FakeProvider needs at least one response");
    }
    this.responses = [...opts.responses];
    this.usage = opts.usage ?? { tokensIn: 10, tokensOut: 5 };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    this.calls++;
    this.lastParams = params;
    const next =
      this.responses.length > 1
        ? this.responses.shift()!
        : this.responses[0];
    if (next instanceof Error) throw next;
    return { raw: next, usage: this.usage, model: this.model };
  }
}
