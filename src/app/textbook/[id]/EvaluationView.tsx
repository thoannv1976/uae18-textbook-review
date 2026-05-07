import type { Evaluation } from '@/lib/types';

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-100 text-emerald-700';
  if (score >= 6.5) return 'bg-blue-100 text-blue-700';
  if (score >= 5) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function barColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 6.5) return 'bg-blue-500';
  if (score >= 5) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function EvaluationView({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-slate-500">Điểm tổng thể (trung bình có trọng số)</div>
            <div className="text-4xl font-bold mt-1">{evaluation.overallScore.toFixed(1)}<span className="text-xl text-slate-400">/10</span></div>
          </div>
          <div className="text-xs text-slate-500 text-right">
            <div>Mô hình: {evaluation.model}</div>
            {evaluation.totalTokensIn != null && (
              <div>
                Tokens: {evaluation.totalTokensIn.toLocaleString('vi-VN')} in /{' '}
                {evaluation.totalTokensOut?.toLocaleString('vi-VN') ?? '—'} out
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Điểm theo 8 tiêu chí</h2>
        <div className="space-y-3">
          {evaluation.criteria.map((c) => (
            <div key={c.criterionId} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-medium text-slate-800">
                  {c.criterionText}
                  <span className="text-xs text-slate-400 ml-2">
                    (trọng số {(c.weight * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className={`score-pill ${scoreColor(c.score)}`}>
                  {c.score.toFixed(1)}
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded">
                <div
                  className={`h-1.5 rounded ${barColor(c.score)}`}
                  style={{ width: `${(c.score / 10) * 100}%` }}
                />
              </div>
              {c.comment && (
                <div className="text-xs text-slate-500 mt-1 line-clamp-3">
                  {c.comment}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {evaluation.topSuggestions.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Top gợi ý chỉnh sửa</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
            {evaluation.topSuggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.chapterScores.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Điểm từng chương</h2>
          <div className="divide-y divide-slate-100">
            {evaluation.chapterScores.map((ch) => (
              <div
                key={ch.chapterIndex}
                className="py-2.5 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {ch.chapterIndex}. {ch.chapterTitle}
                  </div>
                  {ch.comment && (
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {ch.comment}
                    </div>
                  )}
                </div>
                <div className={`score-pill ${scoreColor(ch.score)}`}>
                  {ch.score.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
