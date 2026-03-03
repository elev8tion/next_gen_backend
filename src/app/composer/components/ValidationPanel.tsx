"use client";

interface ValidationPanelProps {
  errors: string[];
  warnings: string[];
  onValidate: () => void;
  validating: boolean;
}

export default function ValidationPanel({ errors, warnings, onValidate, validating }: ValidationPanelProps) {
  return (
    <div className="border-t border-card-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Validation</h3>
        <button
          onClick={onValidate}
          disabled={validating}
          className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {validating ? "..." : "Validate"}
        </button>
      </div>

      {errors.length === 0 && warnings.length === 0 && (
        <p className="text-xs text-muted">No validation results yet.</p>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="rounded border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] text-danger">
              {err}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((warn, i) => (
            <div key={i} className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] text-warning">
              {warn}
            </div>
          ))}
        </div>
      )}

      {errors.length === 0 && warnings.length === 0 && (
        <div className="rounded border border-success/30 bg-success/10 px-2 py-1 text-[10px] text-success">
          All checks passed
        </div>
      )}
    </div>
  );
}
