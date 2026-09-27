import type { TraceStep } from '@/services/agentCore'

export type { TraceStep }

export const TOOL_LABEL: Record<string, string> = {
    get_market_event: 'Looked up the market move',
    get_price_context: 'Checked longer-term price history',
    get_my_profile: 'Read your goal',
    get_my_positions: 'Pulled your positions',
    get_my_impact: 'Fetched your computed dollar impact',
    submit_insight: 'Wrote your insight',
    get_household_profile: 'Read the household profile and notes',
    get_household_holdings: 'Pulled the household holdings',
    get_event_impact: 'Fetched the computed dollar impact',
    submit_brief: 'Submitted the brief',
}

/** Step-by-step record of what the agent looked up and why. */
export function Trace({ steps }: { steps: TraceStep[] }) {
    if (steps.length === 0) return <p className="text-sm text-muted-foreground">No trace recorded.</p>
    return (
        <ol className="relative space-y-3 border-l pl-5">
            {steps
                .filter((s) => s.type !== 'model_turn')
                .map((s, i) => (
                    <li key={i} className="relative">
                        <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${s.type === 'reasoning' ? 'bg-violet-400' : 'bg-sky-400'}`} />
                        {s.type === 'reasoning' ? (
                            <details>
                                <summary className="cursor-pointer text-sm text-violet-300">
                                    Reasoning <span className="text-xs text-muted-foreground">· {(s.atMs / 1000).toFixed(1)}s</span>
                                </summary>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.text}</p>
                            </details>
                        ) : (
                            <details>
                                <summary className="cursor-pointer text-sm">
                                    {TOOL_LABEL[s.tool] ?? s.tool}{' '}
                                    <code className="text-xs text-muted-foreground">{s.tool}</code>{' '}
                                    <span className="text-xs text-muted-foreground">· {(s.atMs / 1000).toFixed(1)}s</span>
                                </summary>
                                <pre className="mt-1 max-h-64 overflow-auto rounded bg-secondary/40 p-2 text-xs text-muted-foreground">
                                    {JSON.stringify(s.output, null, 2)}
                                </pre>
                            </details>
                        )}
                    </li>
                ))}
        </ol>
    )
}
