import type { JsonObject, JsonValue, Message } from "@coreweave/forge-sdk/agentlens/tracing";
import { resolveForgeProject, resolveWandbKey } from "./credentials";

/**
 * Agent Lens tracing for the Sensei agent, behind one small interface so the agent code
 * never touches OpenTelemetry directly and runs unchanged when tracing is off.
 *
 * Span attribute namespace: `nihongo.*`. These are what Agent Lens tags and saved views
 * filter on (see agentlens/tags.md).
 */
export type AttrValue = string | number | boolean;

export interface TurnTrace {
  conversationId: string;
  setAttributes(attrs: Record<string, AttrValue | undefined>): void;
  tool<T extends JsonValue>(name: string, args: JsonObject, work: () => T | Promise<T>): Promise<T>;
  llm<T>(
    model: string,
    input: Message[],
    systemInstructions: string[],
    work: () => Promise<T>,
    project: (result: T) => { output: string; inputTokens?: number; outputTokens?: number; responseModel?: string },
  ): Promise<T>;
  output(text: string): void;
}

export interface RunOptions {
  conversationId: string;
  conversationName?: string;
  userMessage: string;
  agentVersion?: string;
  model?: string;
  attributes?: Record<string, AttrValue | undefined>;
}

export interface TraceRunner {
  enabled(): Promise<boolean>;
  project: string;
  run<T>(opts: RunOptions, work: (trace: TurnTrace) => Promise<T>): Promise<T>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export const AGENT_NAME = "nihongo-sensei";
export const AGENT_VERSION = "sensei-v6";

function clean(attrs: Record<string, AttrValue | undefined> | undefined): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== undefined) out[k] = v;
  return out;
}

const noopTrace = (conversationId: string): TurnTrace => ({
  conversationId,
  setAttributes() {},
  async tool(_name, _args, work) {
    return work();
  },
  async llm(_model, _input, _sys, work) {
    return work();
  },
  output() {},
});

export interface TraceRunnerOptions {
  /** Force on/off; default follows FORGE_TRACING env (off only when set to "0"/"false") plus key presence. */
  enabled?: boolean;
  project?: string;
  apiKey?: string;
  /** "simple" flushes each span immediately (short-lived sim processes); "batch" for servers. */
  spanProcessor?: "simple" | "batch";
}

export function createTraceRunner(options: TraceRunnerOptions = {}): TraceRunner {
  const project = options.project ?? resolveForgeProject();
  const apiKey = options.apiKey ?? resolveWandbKey();
  const envFlag = (process.env.FORGE_TRACING ?? "1").toLowerCase();
  const wanted = options.enabled ?? !(envFlag === "0" || envFlag === "false");
  let sdk: typeof import("@coreweave/forge-sdk/agentlens/tracing") | null = null;
  let initialized: Promise<boolean> | undefined;

  async function enabled(): Promise<boolean> {
    if (!wanted || !apiKey) return false;
    initialized ??= (async () => {
      try {
        sdk = await import("@coreweave/forge-sdk/agentlens/tracing");
        await sdk.init(project, {
          apiKey,
          serviceName: AGENT_NAME,
          spanProcessor: options.spanProcessor ?? "batch",
        });
        return true;
      } catch (err) {
        console.warn(`[tracing] disabled: ${err instanceof Error ? err.message : String(err)}`);
        sdk = null;
        return false;
      }
    })();
    return initialized;
  }

  return {
    project,
    enabled,
    async run(opts, work) {
      if (!(await enabled()) || !sdk) return work(noopTrace(opts.conversationId));
      const tracing = sdk;
      return tracing.runIsolated(async () => {
        const conversation = tracing.startConversation({
          conversationId: opts.conversationId,
          agentName: AGENT_NAME,
          agentVersion: opts.agentVersion ?? AGENT_VERSION,
          model: opts.model,
          attributes: clean(opts.attributes),
        });
        const turn = conversation.startTurn({
          userMessage: opts.userMessage,
          agentName: AGENT_NAME,
          agentVersion: opts.agentVersion ?? AGENT_VERSION,
          model: opts.model,
          attributes: clean(opts.attributes),
        });
        let failure: Error | undefined;
        const trace: TurnTrace = {
          conversationId: opts.conversationId,
          setAttributes(attrs) {
            turn.setAttributes(clean(attrs));
          },
          async tool(name, args, work) {
            const span = turn.startTool({ name, args });
            try {
              const result = await work();
              span.end({ result });
              return result;
            } catch (err) {
              span.end({ error: err instanceof Error ? err : new Error(String(err)) });
              throw err;
            }
          },
          async llm(model, input, systemInstructions, work, project) {
            const span = turn.startLLM({ model, providerName: "coreweave", systemInstructions });
            try {
              const result = await work();
              const p = project(result);
              span.record({
                inputMessages: input,
                outputMessages: [{ role: "assistant", parts: [{ type: "text", content: p.output }] }],
                usage: { inputTokens: p.inputTokens, outputTokens: p.outputTokens },
                responseModel: p.responseModel,
              });
              span.end();
              return result;
            } catch (err) {
              span.end({ error: err instanceof Error ? err : new Error(String(err)) });
              throw err;
            }
          },
          output(text) {
            turn.record({ outputMessages: [{ role: "assistant", parts: [{ type: "text", content: text }] }] });
          },
        };
        try {
          return await work(trace);
        } catch (err) {
          failure = err instanceof Error ? err : new Error(String(err));
          throw err;
        } finally {
          turn.end(failure ? { error: failure } : undefined);
          conversation.end(failure ? { error: failure } : undefined);
        }
      });
    },
    async flush() {
      if (sdk) await sdk.forceFlush();
    },
    async shutdown() {
      if (sdk) await sdk.shutdown();
    },
  };
}
