export const PATTERNS = ['Phantom billing (klaim palsu)', 'Repeat billing (klaim berulang)', 'Manipulasi diagnosis dan/atau tindakan (upcoding)', 'Services unbundling / fragmentation', 'Inflated bills (penggelembungan tagihan)', 'Cloning (penjiplakan klaim)'] as const
export const TYPE_NAMES: Record<string, string> = Object.fromEntries(['phantom', 'repeat', 'upcoding', 'unbundling', 'inflated', 'cloning'].map((t, i) => [t, PATTERNS[i]]))
export type Tier = 'high' | 'medium' | 'low'
export interface Claim {
  claim_id: string; patient_ref: string; faskes_id: string; faskes_class: string; faskes_ownership: string; service_type: string
  dx: string; dx_name: string; proc: string; severity: string; admit_date: string; los: number
  claim_total: number; peer_median: number; est_excess: number; risk_score: number; risk_tier: Tier; if_score: number
  patterns: string[]; reasons: { feature: string; text: string; shap: number; direction: 'up' | 'down' }[]
  eval?: { label: number; type: string }
}
export interface Facility {
  faskes_id: string; faskes_class: string; faskes_ownership: string; n_claims: number; n_high: number; high_rate: number
  avg_risk: number; est_excess_total: number; pattern_counts: Record<string, number>; risk_rank: number
}
export interface Summary {
  generated_at: string; data_source?: string
  dataset: { n_claims: number; n_faskes: number; n_patients: number; fraud_rate: number; synthetic: boolean }
  kpi: { n_high: number; n_medium: number; n_low: number; est_excess_total_idr: number; n_faskes_high_risk: number }
  tiers: { high_top_pct: number; medium_top_pct: number; score_cut_high: number; score_cut_medium: number }
  score_hist: { bin_edges: number[]; counts: number[] }; disclaimer: string
}
export type Variants = { if_only: number; xgb_only: number; hybrid: number }
export type SupervisedVariants = Pick<Variants, 'xgb_only' | 'hybrid'>
export interface GroupedEvaluation {
  group: string; n_groups: number; folds: number; seed: number; note: string
  pr_auc: SupervisedVariants
  at_budget: Record<string, { recall: SupervisedVariants; precision: SupervisedVariants; selected_claims: number }>
  per_type_recall_at_5: Record<string, SupervisedVariants>
}
export interface Report {
  config: { seed: number; folds: number; if_params: object; xgb_params: object }; pr_auc: Variants
  at_budget: Record<string, { recall: Variants; precision: Variants }>
  lift_curve: { pct: number; recall_hybrid: number; recall_random: number }[]
  per_type_recall_at_5: Record<string, Variants>; holdout: Record<string, Variants>
  feature_importance: { feature: string; label: string; importance: number }[]; notes: string[]
  grouped_eval?: Record<string, GroupedEvaluation>
}
export interface Feature { feature: string; label: string; explain: string; template: string }
export interface Data { summary: Summary; claims: Claim[]; facilities: Facility[]; report: Report; dictionary: Feature[] }
export type DecisionValue = 'Perlu diperiksa' | 'Wajar' | 'Eskalasi'
export interface Decision { claim_id: string; decision: DecisionValue; note: string; updated_at: string }
