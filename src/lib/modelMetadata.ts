export interface ModelMetadata {
  version?: string | number | null;
  trained_at?: string | null;
  serving_mode?: string | null;
  deployment_approved?: boolean | null;
  probability_available?: boolean | null;
  research_rank_status?: string | null;
  active_run_id?: string | null;
  deployment_reasons?: string[];
}

export function modelMetadataLabel(metadata?: ModelMetadata | null): string {
  if (!metadata) return "Artifact provenance not supplied";
  return [metadata.version != null ? `artifact ${metadata.version}` : null,
    metadata.trained_at ? `trained ${metadata.trained_at}` : null,
    metadata.serving_mode?.replaceAll("_", " "),
    metadata.research_rank_status ? `research rank ${metadata.research_rank_status}` : null,
    metadata.deployment_approved === false ? "not approved for trading" : null,
    metadata.active_run_id ? `run ${metadata.active_run_id}` : null,
  ].filter(Boolean).join(" · ") || "Artifact provenance incomplete";
}
