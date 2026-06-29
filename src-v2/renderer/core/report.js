;(function initReport(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2Report = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  function buildReportPackage(project, analysisResult, options) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const sources = Array.isArray(project && project.sources) ? project.sources : []
    const warnings = Array.isArray(analysisResult && analysisResult.warnings) ? analysisResult.warnings : []
    const included = samples.filter((sample) => sample.included !== false).length
    const reportScope = normalizeReportScope(
      (options && options.reportScope) || (project && project.settings && project.settings.reportScope)
    )
    const figures = buildFigures(project || {}, analysisResult, reportScope)
    const tables = buildTables(analysisResult)
    const scopes = buildReportScopes(project || {}, analysisResult || {}, figures, reportScope)
    const readiness = buildReadiness(project || {}, analysisResult || {}, figures, tables, included, sources)
    return {
      title: (project && project.title) || 'Untitled ERG project',
      schema: 'erg-viewer-v2-report',
      analysisPlan: (analysisResult && analysisResult.plan) || null,
      reportScope,
      scopes,
      summary: {
        records: samples.length,
        included,
        files: sources.length,
        warnings: warnings.length,
        figures: figures.length,
        tables: tables.length,
        scopes: scopes.length,
      },
      figures,
      tables,
      warnings,
      readiness,
      exportManifest: buildExportManifest(analysisResult),
    }
  }

  function buildFigures(project, result, reportScope) {
    if (!result) return []
    if (reportScope === 'source-appendix') {
      const sourceRows = Array.isArray(result.sourceRows) ? result.sourceRows : []
      return [
        figureRow({
          id: 'source_data_appendix',
          title: 'Source data and inclusion appendix',
          kind: 'source-data',
          ready: sourceRows.length > 0,
          readyDetail: `${sourceRows.length} source row${sourceRows.length === 1 ? '' : 's'}`,
          blockedDetail: 'No source rows are available',
        }),
      ]
    }
    const sourceType = reportSourceType(result)
    const scopedSamples = scopedProjectSamples(project, result)
    const figures =
      sourceType === 'FVEP'
        ? buildFvepPublicationPreset(result, scopedSamples)
        : buildErgPublicationPreset(result, scopedSamples)
    return figures.length
      ? figures
      : [
          {
            id: 'no_figure',
            title: 'No reportable figure',
            kind: 'none',
            status: 'blocked',
            detail: 'No included values',
          },
        ]
  }

  function buildFvepPublicationPreset(result, samples) {
    const sourceRows = Array.isArray(result.sourceRows) ? result.sourceRows : []
    const finiteRows = sourceRows.filter((row) => Number.isFinite(Number(row.value)))
    const conditionCount = unique(sourceRows.map((row) => row.condition)).length
    return [
      figureRow({
        id: 'fvep_representative_traces',
        title: 'Representative FVEP traces',
        kind: 'representative-waveform',
        ready: samples.some(hasTraceData),
        readyDetail: `${samples.filter(hasTraceData).length} trace record${samples.filter(hasTraceData).length === 1 ? '' : 's'} available`,
        blockedDetail: 'No trace arrays available in the current FVEP scope',
      }),
      figureRow({
        id: 'fvep_average_waveform',
        title: 'FVEP average waveform',
        kind: 'waveform',
        ready: result.waveformSummary && result.waveformSummary.status === 'ok',
        readyDetail:
          result.waveformSummary && result.waveformSummary.series
            ? `${result.waveformSummary.series.length} group trace${result.waveformSummary.series.length === 1 ? '' : 's'}`
            : '',
        blockedDetail:
          conditionCount > 1
            ? 'Select one stimulus before averaging FVEP waveforms'
            : 'No included FVEP traces are available',
      }),
      figureRow({
        id: 'fvep_amplitude_quantification',
        title: 'FVEP N/P peak-to-peak amp quantification',
        kind: conditionCount > 1 ? 'response-curve' : 'group-summary',
        ready: finiteRows.length > 0,
        readyDetail:
          conditionCount > 1
            ? `${conditionCount} ${conditionCount === 1 ? 'stimulus' : 'stimuli'}`
            : `${finiteRows.length} source value${finiteRows.length === 1 ? '' : 's'}`,
        blockedDetail: 'No finite FVEP N/P peak-to-peak amp values in the current scope',
      }),
      figureRow({
        id: 'fvep_latency_quantification',
        title: 'FVEP N1/P1/N2/P2 latency quantification',
        kind: 'latency-summary',
        ready: samples.some((sample) => hasAnyMetric(sample, ['n1LatencyMs', 'p1LatencyMs', 'n2LatencyMs', 'p2LatencyMs'])),
        readyDetail: 'N1/P1/N2/P2 latency metrics available',
        blockedDetail: 'No N1/P1/N2/P2 latency metrics detected',
      }),
      figureRow({
        id: 'source_data_appendix',
        title: 'Source data and inclusion appendix',
        kind: 'source-data',
        ready: sourceRows.length > 0,
        readyDetail: `${sourceRows.length} source row${sourceRows.length === 1 ? '' : 's'}`,
        blockedDetail: 'No source rows are available',
      }),
    ]
  }

  function buildErgPublicationPreset(result, samples) {
    const sourceRows = Array.isArray(result.sourceRows) ? result.sourceRows : []
    const conditionCount = unique(sourceRows.map((row) => row.condition)).length
    const modes = unique(samples.map((sample) => sample.mode))
    return [
      figureRow({
        id: 'erg_representative_traces',
        title: 'Representative ERG traces',
        kind: 'representative-waveform',
        ready: samples.some(hasTraceData),
        readyDetail: `${samples.filter(hasTraceData).length} trace record${samples.filter(hasTraceData).length === 1 ? '' : 's'} available`,
        blockedDetail: 'No trace arrays available in the current ERG scope',
      }),
      figureRow({
        id: 'erg_awave_response_curve',
        title: 'a-wave response curve',
        kind: 'response-curve',
        ready: conditionCount > 1 && samples.some((sample) => hasAnyMetric(sample, ['aAmplitudeUv'])),
        readyDetail: `${conditionCount} ${conditionCount === 1 ? 'stimulus' : 'stimuli'}`,
        blockedDetail: 'Need a-wave amps across multiple stimuli',
      }),
      figureRow({
        id: 'erg_bwave_response_curve',
        title: 'b-wave response curve',
        kind: 'response-curve',
        ready: conditionCount > 1 && samples.some((sample) => hasAnyMetric(sample, ['bAmplitudeUv'])),
        readyDetail: `${conditionCount} ${conditionCount === 1 ? 'stimulus' : 'stimuli'}`,
        blockedDetail: 'Need b-wave amps across multiple stimuli',
      }),
      figureRow({
        id: 'erg_implicit_time_summary',
        title: 'a/b-wave implicit-time summary',
        kind: 'implicit-time-summary',
        ready: samples.some((sample) => hasAnyMetric(sample, ['aLatencyMs', 'bLatencyMs'])),
        readyDetail: 'a/b-wave implicit-time metrics available',
        blockedDetail: 'No a/b-wave implicit-time metrics detected',
      }),
      figureRow({
        id: 'erg_op_summary',
        title: 'OP/dOps amp summary',
        kind: 'op-summary',
        ready:
          modes.some((mode) => String(mode).toLowerCase() === 'dops') ||
          samples.some((sample) => hasAnyMetric(sample, ['sumOpAmplitudeUv'])),
        readyDetail: 'OP/dOps endpoint available',
        blockedDetail: 'No dOps protocol or summed OP amp detected',
      }),
      figureRow({
        id: 'erg_flicker_summary',
        title: 'Flicker ERG summary',
        kind: 'flicker-summary',
        ready:
          modes.some((mode) => String(mode).toLowerCase() === 'flicker') &&
          samples.some((sample) =>
            hasAnyMetric(sample, ['flickerAmplitudeUv', 'flickerPhaseDeg', 'flickerImplicitTimeMs'])
          ),
        readyDetail: 'Flicker amp, phase, or peak-time endpoint available',
        blockedDetail: 'No Flicker amp, phase, or peak-time endpoint detected',
      }),
      figureRow({
        id: 'source_data_appendix',
        title: 'Source data and inclusion appendix',
        kind: 'source-data',
        ready: sourceRows.length > 0,
        readyDetail: `${sourceRows.length} source row${sourceRows.length === 1 ? '' : 's'}`,
        blockedDetail: 'No source rows are available',
      }),
    ]
  }

  function figureRow({ id, title, kind, ready, readyDetail, blockedDetail }) {
    return {
      id,
      title,
      kind,
      status: ready ? 'ready' : 'blocked',
      detail: ready ? readyDetail : blockedDetail,
    }
  }

  function buildTables(result) {
    if (!result) return []
    return [
      {
        id: 'analysis_source',
        title: 'Analysis source data',
        rows: Array.isArray(result.sourceRows) ? result.sourceRows.length : 0,
        previewRows: previewAnalysisRows(result.sourceRows),
      },
      {
        id: 'group_summary',
        title: 'Group summary',
        rows: Array.isArray(result.cohortSummary) ? result.cohortSummary.length : 0,
        previewRows: previewSummaryRows(result.cohortSummary),
      },
      {
        id: 'stimulus_summary',
        title: 'Stimulus summary',
        rows: Array.isArray(result.conditionSummary) ? result.conditionSummary.length : 0,
        previewRows: previewSummaryRows(result.conditionSummary),
      },
      {
        id: 'analysis_warnings',
        title: 'Analysis warnings',
        rows: Array.isArray(result.warnings) ? result.warnings.length : 0,
        previewRows: previewWarningRows(result.warnings),
      },
      {
        id: 'paired_readiness',
        title: 'Paired-ID readiness details',
        rows: Array.isArray(result.pairedReadiness) ? result.pairedReadiness.length : 0,
        previewRows: previewPairedReadinessRows(result.pairedReadiness),
      },
    ]
  }

  function previewAnalysisRows(rows) {
    return (rows || []).slice(0, 8).map((row) => ({
      subject: row.subjectId || row.sample || '',
      cohort: row.cohort || '',
      condition: row.condition || '',
      included: row.included !== false,
      value: row.value,
    }))
  }

  function previewSummaryRows(rows) {
    return (rows || []).slice(0, 8).map((row) => ({
      cohort: row.cohort || '',
      condition: row.condition || '',
      n: row.n || 0,
      mean: row.mean,
      sem: row.sem,
    }))
  }

  function previewWarningRows(rows) {
    return (rows || []).slice(0, 8).map((row) => ({
      code: row.code || '',
      level: row.level || '',
      message: row.message || '',
    }))
  }

  function previewPairedReadinessRows(rows) {
    return (rows || []).slice(0, 8).map((row) => ({
      issue: row.issue || '',
      condition: row.condition || '',
      cohort: row.cohort || '',
      pairedId: row.pairedId || '',
      sampleIds: Array.isArray(row.sampleIds) ? row.sampleIds.join(', ') : '',
      message: row.message || '',
    }))
  }

  function buildReadiness(project, result, figures, tables, included, sources) {
    const warnings = Array.isArray(result.warnings) ? result.warnings : []
    const plan = (result && result.plan) || {}
    const stats = (result && result.stats) || {}
    const hasError = warnings.some((warning) => warning.level === 'error')
    const rows = [
      readinessRow(
        project.savedAt ? 'Project file saved' : 'Project file not saved',
        project.savedAt ? 'ok' : 'warn'
      ),
      readinessRow(
        `${included}/${Array.isArray(project.samples) ? project.samples.length : 0} records included`,
        included ? 'ok' : 'warn'
      ),
      readinessRow(
        `${sources.length} source file${sources.length === 1 ? '' : 's'} linked`,
        sources.length ? 'ok' : 'warn'
      ),
      readinessRow(
        `${figures.filter((figure) => figure.status === 'ready').length} report figure${figures.length === 1 ? '' : 's'} ready`,
        figures.some((figure) => figure.status === 'ready') ? 'ok' : 'warn'
      ),
      readinessRow(
        `${tables.reduce((sum, table) => sum + table.rows, 0)} report table rows`,
        tables.some((table) => table.rows) ? 'ok' : 'warn'
      ),
      readinessRow(
        hasError
          ? 'Analysis has blocking errors'
          : `${warnings.length} analysis warning${warnings.length === 1 ? '' : 's'}`,
        hasError ? 'error' : warnings.length ? 'warn' : 'ok'
      ),
    ]
    if (plan.comparisonDesign === 'paired' || stats.blockedBy === 'paired-design') {
      rows.push(readinessRow('Paired design is descriptive-only in this build', 'warn'))
    }
    const pairedWarnings = warnings.filter((warning) => String(warning.code || '').startsWith('paired-id-'))
    if (pairedWarnings.length) {
      rows.push(
        readinessRow(
          `${pairedWarnings.length} paired-ID readiness warning${pairedWarnings.length === 1 ? '' : 's'}`,
          'warn'
        )
      )
    }
    return rows
  }

  function buildReportScopes(project, result, currentFigures, activeScope) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const currentRows = Array.isArray(result && result.sourceRows) ? result.sourceRows : []
    const ergSamples = samples.filter((sample) => sampleSourceType(sample) === 'ERG')
    const fvepSamples = samples.filter((sample) => sampleSourceType(sample) === 'FVEP')
    const currentTitle = currentScopeTitle((result && result.plan) || {})
    const ergFigures = buildErgPublicationPreset(presetResultForSamples(ergSamples), ergSamples)
    const fvepFigures = buildFvepPublicationPreset(presetResultForSamples(fvepSamples), fvepSamples)
    return [
      scopeRow({
        id: 'current',
        title: 'Current analysis',
        detail: currentTitle,
        records: currentRows.length,
        figures: currentFigures,
        activeScope,
      }),
      scopeRow({
        id: 'erg-preset',
        title: 'Full ERG preset',
        detail: `${ergSamples.length} ERG record${ergSamples.length === 1 ? '' : 's'}`,
        records: ergSamples.length,
        figures: ergFigures,
        activeScope,
      }),
      scopeRow({
        id: 'fvep-preset',
        title: 'Full FVEP preset',
        detail: `${fvepSamples.length} FVEP record${fvepSamples.length === 1 ? '' : 's'}`,
        records: fvepSamples.length,
        figures: fvepFigures,
        activeScope,
      }),
      {
        id: 'source-appendix',
        title: 'Source appendix',
        detail: `${samples.length} record${samples.length === 1 ? '' : 's'} across all sources`,
        records: samples.length,
        readyFigures: samples.length ? 1 : 0,
        totalFigures: 1,
        blockedFigures: samples.length ? 0 : 1,
        active: activeScope === 'source-appendix',
      },
    ]
  }

  function scopeRow({ id, title, detail, records, figures, activeScope }) {
    const readyFigures = (figures || []).filter((figure) => figure.status === 'ready').length
    return {
      id,
      title,
      detail,
      records,
      readyFigures,
      totalFigures: (figures || []).length,
      blockedFigures: (figures || []).filter((figure) => figure.status === 'blocked').length,
      active: activeScope === id,
    }
  }

  function presetResultForSamples(samples) {
    const sourceRows = (samples || []).map((sample) => ({
      sampleId: sample.id || '',
      sourceType: sampleSourceType(sample),
      condition: sample.condition || '',
      value:
        sample && sample.metrics && sample.metrics.raw
          ? sampleSourceType(sample) === 'FVEP'
            ? sample.metrics.raw.p1n1AmplitudeUv
            : sample.metrics.raw.bAmplitudeUv || sample.metrics.raw.amplitudeUv
          : Number.isFinite(Number(sample && sample.value))
            ? Number(sample.value)
            : null,
    }))
    return {
      sourceRows,
      waveformSummary: { status: 'condition-required', message: '', series: [] },
    }
  }

  function currentScopeTitle(plan) {
    return [
      plan.sourceType || 'All sources',
      plan.protocolMode && plan.protocolMode !== 'All' ? plan.protocolMode : '',
      plan.protocolFamily && plan.protocolFamily !== 'All' ? plan.protocolFamily : '',
      plan.condition && plan.condition !== 'All' ? plan.condition : '',
      plan.metricKey || '',
      plan.metricVersion ? `(${plan.metricVersion})` : '',
    ]
      .filter(Boolean)
      .join(' / ')
  }

  function normalizeReportScope(scope) {
    return ['current', 'erg-preset', 'fvep-preset', 'source-appendix'].includes(scope) ? scope : 'current'
  }

  function buildExportManifest(result) {
    const plan = (result && result.plan) || {}
    return {
      metric: plan.metricKey || '',
      layer: plan.metricVersion || '',
      sourceType: plan.sourceType || '',
      protocol: plan.protocolMode || '',
      stimulus: plan.condition || '',
      sheets: [
        'samples',
        'groups',
        'metrics_raw',
        'metrics_manual',
        'metrics_corrected',
        'group_summary',
        'stimulus_summary',
        'stats',
        'figure_source',
        'corrections_log',
        'sources',
        'analysis_plan',
        'analysis_source',
        'analysis_warnings',
        'paired_readiness',
        'report_figures',
        'report_scopes',
        'report_readiness',
      ],
    }
  }

  function readinessRow(label, status) {
    return { label, status: status || 'ok' }
  }

  function reportSourceType(result) {
    const plan = (result && result.plan) || {}
    if (plan.sourceType === 'FVEP') return 'FVEP'
    if (plan.sourceType === 'ERG') return 'ERG'
    if (String(plan.protocolMode || '').toLowerCase() === 'fvep') return 'FVEP'
    const rows = Array.isArray(result && result.sourceRows) ? result.sourceRows : []
    return rows.length && rows.every((row) => row.sourceType === 'FVEP') ? 'FVEP' : 'ERG'
  }

  function sampleSourceType(sample) {
    return String(sample && sample.mode ? sample.mode : '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
  }

  function scopedProjectSamples(project, result) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const sourceRows = Array.isArray(result && result.sourceRows) ? result.sourceRows : []
    if (!sourceRows.length) return samples
    const scopedIds = new Set(sourceRows.map((row) => row.sampleId).filter(Boolean))
    return samples.filter((sample) => scopedIds.has(sample.id))
  }

  function hasTraceData(sample) {
    return ['right', 'left'].some((side) => {
      const trace = sample && sample.traces && sample.traces[side]
      return trace && Array.isArray(trace.x) && Array.isArray(trace.y) && trace.x.length && trace.y.length
    })
  }

  function hasAnyMetric(sample, metricKeys) {
    const raw = (sample && sample.metrics && sample.metrics.raw) || {}
    return (metricKeys || []).some((key) => Number.isFinite(Number(raw[key])))
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter((value) => value != null && value !== '')))
  }

  return {
    buildReportPackage,
  }
})
