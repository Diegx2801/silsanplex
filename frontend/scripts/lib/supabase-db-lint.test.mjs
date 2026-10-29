import { describe, expect, it } from 'vitest'
import { assertSupabaseDbLintSucceeded } from './supabase-db-lint.mjs'

const cleanReport = '{"results":[],"message":"db lint"}'

describe('assertSupabaseDbLintSucceeded', () => {
  it('accepts an explicit clean JSON lint report', () => {
    expect(assertSupabaseDbLintSucceeded({ status: 0, stdout: cleanReport, stderr: '' }))
      .toEqual({ results: [], message: 'db lint' })
  })

  it('rejects warnings even if the CLI unexpectedly exits successfully', () => {
    expect(() => assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: '{"results":[{"level":"warning","message":"warning fixture"}],"message":"db lint"}',
      stderr: '',
    })).toThrow('SUPABASE_DB_LINT_FINDINGS')
  })

  it('rejects errors even if the CLI unexpectedly exits successfully', () => {
    expect(() => assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: '{"results":[{"level":"error","message":"error fixture"}],"message":"db lint"}',
      stderr: '',
    })).toThrow('SUPABASE_DB_LINT_FINDINGS')
  })

  it('rejects findings returned as a top-level JSON array', () => {
    expect(() => assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: '[{"level":"warning","message":"warning fixture"}]',
      stderr: '',
    })).toThrow('SUPABASE_DB_LINT_UNKNOWN_JSON')
  })

  it('rejects empty output', () => {
    expect(() => assertSupabaseDbLintSucceeded({ status: 0, stdout: '', stderr: '' }))
      .toThrow('SUPABASE_DB_LINT_EMPTY_OUTPUT')
  })

  it('rejects human-readable non-JSON output instead of treating it as clean', () => {
    expect(() => assertSupabaseDbLintSucceeded({ status: 0, stdout: 'No schema errors found', stderr: '' }))
      .toThrow('SUPABASE_DB_LINT_NON_JSON_OUTPUT')
  })

  it('rejects unknown valid JSON shapes', () => {
    expect(() => assertSupabaseDbLintSucceeded({ status: 0, stdout: '{"ok":true}', stderr: '' }))
      .toThrow('SUPABASE_DB_LINT_UNKNOWN_JSON')
  })

  it('rejects a non-zero CLI exit even when its JSON report is empty', () => {
    expect(() => assertSupabaseDbLintSucceeded({ status: 1, stdout: '{"results":[]}', stderr: '' }))
      .toThrow('SUPABASE_DB_LINT_EXIT: 1')
  })

  it('accepts JSON on stdout with the CLI success message on stderr', () => {
    expect(assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: cleanReport,
      stderr: 'Connecting to local database...\r\nLinting schema: public\r\nNo schema errors found\r\n',
    })).toEqual({ results: [], message: 'db lint' })
  })

  it('accepts JSON on stderr with benign progress text on stdout', () => {
    expect(assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: 'Linting schema: public\r\n',
      stderr: cleanReport,
    })).toEqual({ results: [], message: 'db lint' })
  })

  it('accepts the installed CLI update notice without mistaking it for a lint warning', () => {
    expect(assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: cleanReport,
      stderr: 'A new version of Supabase CLI is available: v2.122.0 (currently installed v2.115.0)\n'
        + 'We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli',
    })).toEqual({ results: [], message: 'db lint' })
  })

  it('rejects warnings written to a separate output stream', () => {
    expect(() => assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: cleanReport,
      stderr: 'WARNING: unclassified lint warning',
    })).toThrow('SUPABASE_DB_LINT_UNEXPECTED_TEXT')
  })

  it('rejects extra unknown fields even if the results array is empty', () => {
    expect(() => assertSupabaseDbLintSucceeded({
      status: 0,
      stdout: '{"results":[],"message":"db lint","unexpectedFailure":true}',
      stderr: '',
    })).toThrow('SUPABASE_DB_LINT_UNKNOWN_JSON')
  })

  it('rejects process-spawn failures', () => {
    expect(() => assertSupabaseDbLintSucceeded({
      status: null,
      error: new Error('executable missing'),
    })).toThrow('SUPABASE_DB_LINT_SPAWN_FAILED')
  })
})
