/**
 * AIAnalysisPanel — Full AI result display + admin override controls
 *
 * Shows:
 *  - Classification (category + confidence bar)
 *  - Summary
 *  - Duplicate detection (with admin-review badge when needed)
 *  - Priority score (visual progress bar + factor breakdown)
 *  - Action Brief structured card
 *  - "Why did AI decide this?" expandable explanation
 *  - Admin override controls (editable category, priority, reject duplicate)
 */

import React, { useState } from 'react';
import type {
  AIFullAnalysis,
  AIAnalysisState,
  ComplaintCategory,
  ComplaintPriority,
} from '../../types';

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ConfidenceBarProps {
  value: number;
  label?: string;
}
const ConfidenceBar: React.FC<ConfidenceBarProps> = ({ value, label }) => {
  const color =
    value >= 85 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="mt-1">
      {label && <span className="text-xs text-slate-500 mb-1 block">{label}</span>}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${color}`}
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-600 w-9 text-right">
          {value}%
        </span>
      </div>
    </div>
  );
};

// Priority score visual
const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const color =
    score >= 75
      ? 'text-red-600'
      : score >= 50
      ? 'text-orange-500'
      : score >= 25
      ? 'text-yellow-600'
      : 'text-blue-500';
  const bg =
    score >= 75
      ? 'bg-red-50 border-red-200'
      : score >= 50
      ? 'bg-orange-50 border-orange-200'
      : score >= 25
      ? 'bg-yellow-50 border-yellow-200'
      : 'bg-blue-50 border-blue-200';
  return (
    <div
      className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center ${bg}`}
    >
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-slate-500">/100</span>
    </div>
  );
};

// ─── Section wrapper ─────────────────────────────────────────────────────────
const Section: React.FC<{
  icon: string;
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}> = ({ icon, title, children, badge }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {badge}
    </div>
    {children}
  </div>
);

// ─── Category label map ───────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  road_damage: 'Road Damage',
  drainage_blockage: 'Drainage Blockage',
  waterlogging: 'Waterlogging',
  garbage_overflow: 'Garbage Overflow',
  broken_streetlight: 'Broken Streetlight',
  electrical_hazard: 'Electrical Hazard',
  other: 'Other',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-300',
  high: 'bg-orange-100 text-orange-700 border border-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
  low: 'bg-blue-100 text-blue-700 border border-blue-300',
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface AIAnalysisPanelProps {
  analysisState: AIAnalysisState;
  /** Show admin override controls (for authority/admin roles) */
  isAdmin?: boolean;
  /** Called when admin saves an override */
  onOverride?: (overrides: AIAnalysisState['overrides']) => void;
}

const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({
  analysisState,
  isAdmin = false,
  onOverride,
}) => {
  const { status, result, error, overrides } = analysisState;

  // Local override form state
  const [editOverrides, setEditOverrides] = useState<AIAnalysisState['overrides']>(
    overrides || {}
  );
  const [showExplanation, setShowExplanation] = useState(false);
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  // ── Loading state
  if (status === 'loading') {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <svg
            className="animate-spin h-6 w-6 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z"
            />
          </svg>
          <span className="text-blue-700 font-semibold">AI is analyzing your complaint…</span>
        </div>
        <p className="text-blue-600 text-sm text-center">
          Running classification, duplicate detection, priority scoring and action brief generation.
        </p>
      </div>
    );
  }

  // ── Error state
  if (status === 'error' || error) {
    const isKeyMissing =
      error?.includes('GEMINI_API_KEY') || error?.includes('not configured');
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="font-semibold text-red-700">AI Analysis Unavailable</h3>
            {isKeyMissing ? (
              <p className="text-red-600 text-sm mt-1">
                The Gemini API key is not configured on the backend. Add your key to{' '}
                <code className="bg-red-100 px-1 rounded">.env</code> and restart the
                server.
              </p>
            ) : (
              <p className="text-red-600 text-sm mt-1">
                {error || 'An unexpected error occurred. Please try again.'}
              </p>
            )}
            <p className="text-red-500 text-xs mt-2">
              You can still submit your complaint manually. AI analysis will not block submission.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Idle state (not yet triggered)
  if (status === 'idle' || !result) {
    return null;
  }

  // ── Success state
  const { classification, summary, duplicate, priority, actionBrief } = result;

  // Determine effective values (overrides take precedence)
  const effectiveCategory = overrides.categoryOverride || classification.category;
  const effectivePriority = overrides.priorityOverride || priority.urgencyLevel;

  const handleSaveOverrides = () => {
    // The server records the authenticated reviewer and timestamp.
    onOverride?.({ ...editOverrides });
    setShowOverrideForm(false);
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h2 className="text-base font-bold text-slate-800">AI Analysis Result</h2>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowOverrideForm(!showOverrideForm)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {showOverrideForm ? 'Cancel Override' : '✏️ Admin Override'}
          </button>
        )}
      </div>

      {/* ── Admin Override Form ── */}
      {isAdmin && showOverrideForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-amber-800">Admin Override Controls</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Override Category
              </label>
              <select
                value={editOverrides.categoryOverride || ''}
                onChange={e =>
                  setEditOverrides(prev => ({
                    ...prev,
                    categoryOverride: (e.target.value as ComplaintCategory) || undefined,
                  }))
                }
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 focus:outline-none"
              >
                <option value="">Use AI suggestion ({CATEGORY_LABELS[classification.category]})</option>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Override Priority
              </label>
              <select
                value={editOverrides.priorityOverride || ''}
                onChange={e =>
                  setEditOverrides(prev => ({
                    ...prev,
                    priorityOverride: (e.target.value as ComplaintPriority) || undefined,
                  }))
                }
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 focus:outline-none"
              >
                <option value="">Use AI suggestion ({PRIORITY_LABELS[priority.urgencyLevel]})</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          {duplicate.isDuplicate && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editOverrides.duplicateRejected || false}
                  onChange={e =>
                    setEditOverrides(prev => ({
                      ...prev,
                      duplicateRejected: e.target.checked,
                      duplicateConfirmed: false,
                    }))
                  }
                  className="w-4 h-4 rounded text-amber-600"
                />
                <span className="text-sm text-slate-700">
                  Reject AI duplicate flag (treat as unique complaint)
                </span>
              </label>
              {duplicate.requiresAdminVerification && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editOverrides.duplicateConfirmed || false}
                    onChange={e =>
                      setEditOverrides(prev => ({
                        ...prev,
                        duplicateConfirmed: e.target.checked,
                        duplicateRejected: false,
                      }))
                    }
                    className="w-4 h-4 rounded text-amber-600"
                  />
                  <span className="text-sm text-slate-700">
                    Confirm duplicate link to {duplicate.matchedTicketId}
                  </span>
                </label>
              )}
            </div>
          )}
          <button
            onClick={handleSaveOverrides}
            className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            Save Override
          </button>
          {overrides.overriddenBy && (
            <p className="text-xs text-amber-700">
              Last overridden by <strong>{overrides.overriddenBy}</strong> at{' '}
              {new Date(overrides.overriddenAt!).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Grid of 4 panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Classification ── */}
        <Section icon="🏷️" title="Classification">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">
                  {CATEGORY_LABELS[effectiveCategory] || effectiveCategory}
                </span>
                {overrides.categoryOverride && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    Admin Override
                  </span>
                )}
              </div>
              <ConfidenceBar value={classification.confidence} label="Confidence" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {classification.reasoning}
          </p>
          {classification.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {classification.keywords.map(kw => (
                <span
                  key={kw}
                  className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* ── Summary ── */}
        <Section icon="📝" title="AI Summary">
          <p className="text-sm text-slate-700 leading-relaxed italic">"{summary}"</p>
          <p className="text-xs text-slate-400 mt-2">
            Condensed from original description for field officer briefing.
          </p>
        </Section>

        {/* ── Duplicate Detection ── */}
        <Section
          icon="🔍"
          title="Duplicate Detection"
          badge={
            duplicate.isDuplicate && !overrides.duplicateRejected ? (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  duplicate.requiresAdminVerification
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {duplicate.requiresAdminVerification ? '⚠️ Needs Review' : '🔴 Likely Duplicate'}
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                ✅ Unique
              </span>
            )
          }
        >
          {duplicate.isDuplicate && !overrides.duplicateRejected ? (
            <div>
              <p className="text-sm text-slate-700">
                Possible duplicate of{' '}
                <strong className="text-blue-600">{duplicate.matchedTicketId}</strong>
              </p>
              <ConfidenceBar value={duplicate.confidence} label="Match confidence" />
              <p className="text-xs text-slate-500 mt-2">{duplicate.reasoning}</p>
              {duplicate.requiresAdminVerification && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    ⚠️ Confidence is below 85%. Admin verification required before linking.
                    This complaint will NOT be auto-merged.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-700">
                {overrides.duplicateRejected
                  ? 'Admin rejected the AI duplicate flag. Treating as unique.'
                  : 'No duplicate complaints found for this issue and location.'}
              </p>
              {!overrides.duplicateRejected && duplicate.confidence > 0 && (
                <ConfidenceBar value={duplicate.confidence} label="Similarity score" />
              )}
              <p className="text-xs text-slate-500 mt-2">{duplicate.reasoning}</p>
            </div>
          )}
        </Section>

        {/* ── Priority Score ── */}
        <Section
          icon="📊"
          title="Priority Score"
          badge={
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                PRIORITY_COLORS[effectivePriority]
              }`}
            >
              {PRIORITY_LABELS[effectivePriority]}
              {overrides.priorityOverride ? ' (Override)' : ''}
            </span>
          }
        >
          <div className="flex items-center gap-4">
            <ScoreRing score={priority.score} />
            <div className="flex-1 space-y-1">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span>Safety severity</span>
                  <span>{priority.safetyFactor}/25</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div
                    className="h-1.5 bg-red-400 rounded-full"
                    style={{ width: `${(priority.safetyFactor / 25) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span>People affected</span>
                  <span>{priority.peopleFactor}/25</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div
                    className="h-1.5 bg-orange-400 rounded-full"
                    style={{ width: `${(priority.peopleFactor / 25) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span>Urgency</span>
                  <span>{priority.urgencyFactor}/25</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div
                    className="h-1.5 bg-yellow-400 rounded-full"
                    style={{ width: `${(priority.urgencyFactor / 25) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span>Duration</span>
                  <span>{priority.durationFactor}/25</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div
                    className="h-1.5 bg-blue-400 rounded-full"
                    style={{ width: `${(priority.durationFactor / 25) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          <ul className="mt-3 space-y-1">
            {priority.reasons.map((r, i) => (
              <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-2">
            Estimated resolution: ~{priority.estimatedResolutionHours}h
          </p>
        </Section>
      </div>

      {/* ── Action Brief ── */}
      <Section icon="📋" title="Action Brief">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Problem', value: actionBrief.problem },
            { label: 'Location', value: actionBrief.location },
            { label: 'Severity', value: actionBrief.severity },
            { label: 'Public Impact', value: actionBrief.publicImpact },
            { label: 'Recommended Department', value: actionBrief.recommendedDepartment },
            { label: 'Target Resolution', value: `${actionBrief.targetResolutionHours} hours` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                {label}
              </p>
              <p className="text-sm text-slate-800">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 bg-navy-50 bg-blue-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
            Recommended Action for Officers
          </p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {actionBrief.recommendedAction}
          </p>
        </div>
      </Section>

      {/* ── AI Explanation (expandable) ── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <span>🧠</span>
            <span className="text-sm font-semibold text-slate-700">
              Why did the AI decide this?
            </span>
          </div>
          <span className="text-slate-400 text-sm">{showExplanation ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showExplanation && (
          <div className="px-4 py-3 bg-white">
            <p className="text-sm text-slate-600 leading-relaxed">
              {actionBrief.aiExplanation}
            </p>
            <div className="mt-3 p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">
                <strong>Source:</strong> {result.model ? `${result.model} via the server-side Gemini API` : 'Gemini via the server-side API'}
                {result.analysedAt ? ` · analysed ${new Date(result.analysedAt).toLocaleString()}` : ''}. Results shown here are model outputs from
                your configured Gemini key. If the API key is missing or the request fails, an explicit error is shown instead of a fabricated result.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisPanel;

