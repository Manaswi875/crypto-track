/** sessionStorage key for an AI-drafted profile waiting for the user's review */
export const DRAFT_KEY = 'profile-draft'

export type ProfileDraft = {
    goal: string | null
    cryptoReason: string | null
    timeHorizon: string | null
    dropComfortPct: number | null
    crypto: { coinId: 'bitcoin' | 'ethereum' | 'solana'; heldVia: 'fund' | 'direct'; fund: string | null; marketValue: number | null; investedUsd: number | null }[]
    cashUsd: number | null
    investmentsUsd: number | null
    assumptions: string[]
    missing: string[]
}
