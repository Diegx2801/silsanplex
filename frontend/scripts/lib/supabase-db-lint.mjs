function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`)
}

const benignLintMessages = [
  /^Connecting to local database\.\.\.$/,
  /^Linting schema: .+$/,
  /^No schema errors found$/,
  /^A new version of Supabase CLI is available: v[\d.]+ \(currently installed v[\d.]+\)$/,
  /^We recommend updating regularly for new features and bug fixes: https:\/\/supabase\.com\/docs\/guides\/cli\/getting-started#updating-the-supabase-cli$/,
]

function lintReportIsClean(report) {
  if (!report || typeof report !== 'object') fail('SUPABASE_DB_LINT_UNKNOWN_JSON')
  if (report.message !== 'db lint' || !Array.isArray(report.results)
    || Object.keys(report).some(key => !['message', 'results'].includes(key))) {
    fail('SUPABASE_DB_LINT_UNKNOWN_JSON')
  }
  if (report.results.length > 0) {
    fail('SUPABASE_DB_LINT_FINDINGS', `${report.results.length} lint finding(s)`)
  }
  return true
}

/**
 * Accept only a successful CLI exit and a recognized, explicitly clean JSON
 * report. db lint's human-readable output is never treated as a JSON result.
 */
export function assertSupabaseDbLintSucceeded({ status, stdout = '', stderr = '', error } = {}) {
  if (error) fail('SUPABASE_DB_LINT_SPAWN_FAILED', error.message ?? String(error))
  if (status !== 0) fail('SUPABASE_DB_LINT_EXIT', String(status ?? 'unknown'))

  const streams = [
    ['stdout', String(stdout).trim()],
    ['stderr', String(stderr).trim()],
  ].filter(([, value]) => value.length > 0)
  if (streams.length === 0) fail('SUPABASE_DB_LINT_EMPTY_OUTPUT')

  const documents = []
  const supplemental = []
  for (const [stream, value] of streams) {
    try {
      documents.push({ stream, value: JSON.parse(value) })
    } catch {
      supplemental.push({ stream, value })
    }
  }

  if (documents.length !== 1) {
    if (documents.length === 0) fail('SUPABASE_DB_LINT_NON_JSON_OUTPUT')
    fail('SUPABASE_DB_LINT_AMBIGUOUS_JSON_OUTPUT')
  }

  for (const { value } of supplemental) {
    const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    if (lines.some(line => !benignLintMessages.some(pattern => pattern.test(line)))) {
      fail('SUPABASE_DB_LINT_UNEXPECTED_TEXT', lines.join(' | '))
    }
  }

  lintReportIsClean(documents[0].value)
  return documents[0].value
}
