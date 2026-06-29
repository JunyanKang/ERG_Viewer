;(function initExport(root, factory) {
  const api = factory(
    root.ERGv2Metrics || (typeof require === 'function' ? require('./metrics') : null),
    root.ERGv2Protocols || (typeof require === 'function' ? require('./protocols') : null)
  )
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2Export = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory(metrics, protocols) {
  function buildProjectWorkbookSheets(project, analysisResult, reportPackage) {
    const normalized = project && typeof project === 'object' ? project : {}
    const samples = Array.isArray(normalized.samples) ? normalized.samples : []
    const metricRows = buildMetricRows(samples)
    const correctionRows = buildCorrectionRows(samples)
    const cohortSummary = buildCohortSummary(metricRows)
    return {
      samples: [
        [
          'sample_id',
          'subject_id',
          'acquisition_id',
          'label',
          'group',
          'paired_id',
          'included',
          'mode',
          'stimulus',
          'source_name',
          'inferred_group',
          'group_source',
          'inferred_paired_id',
          'paired_id_source',
          'qc_items',
        ],
        ...samples.map((sample) => [
          sample.id || '',
          sample.subjectId || '',
          sample.acquisitionId || '',
          sample.label || '',
          sample.cohort || '',
          sample.pairedId || '',
          sample.included !== false,
          sample.mode || '',
          sample.condition || '',
          sample.sourceName || '',
          sample.inference && sample.inference.cohort ? sample.inference.cohort : '',
          sample.inference && sample.inference.cohortSource ? sample.inference.cohortSource : '',
          sample.inference && sample.inference.pairedId ? sample.inference.pairedId : '',
          sample.inference && sample.inference.pairedIdSource ? sample.inference.pairedIdSource : '',
          Array.isArray(sample.qc) ? sample.qc.map((item) => item.message || '').join('; ') : '',
        ]),
      ],
      groups: [
        ['sample_id', 'subject_id', 'analysis_group', 'paired_id', 'included'],
        ...samples.map((sample) => [
          sample.id || '',
          sample.subjectId || '',
          sample.cohort || 'Unassigned',
          sample.pairedId || '',
          sample.included !== false,
        ]),
      ],
      metrics_raw: metricRowsToSheet(metricRows.filter((row) => row.version === 'raw')),
      metrics_manual: metricRowsToSheet(metricRows.filter((row) => row.version === 'manual')),
      metrics_corrected: metricRowsToSheet(metricRows.filter((row) => row.version === 'corrected')),
      group_summary: summaryRowsToSheet(cohortSummary),
      stimulus_summary: summaryRowsToSheet(analysisResult && analysisResult.conditionSummary),
      stats: summaryRowsToSheet(cohortSummary),
      figure_source: metricRowsToSheet(metricRows),
      corrections_log: [
        ['sample_id', 'subject_id', 'acquisition_id', 'mode', 'eye', 'point', 'x_ms', 'y_uv'],
        ...correctionRows.map((row) => [
          row.sampleId,
          row.subjectId,
          row.acquisitionId,
          row.mode,
          row.eye,
          row.point,
          row.x,
          row.y,
        ]),
      ],
      sources: [
        ['name', 'path', 'source_type', 'modes', 'records', 'imported_at'],
        ...((normalized.sources || []).map((source) => [
          source.name || '',
          source.path || '',
          source.type || '',
          Array.isArray(source.modes) ? source.modes.join(', ') : source.mode || '',
          source.records || 0,
          source.importedAt || '',
        ]) || []),
      ],
      statistical_design: statisticalDesignToSheet(normalized.settings),
      analysis_plan: analysisPlanToSheet(analysisResult && analysisResult.plan),
      analysis_source: analysisRowsToSheet(analysisResult && analysisResult.sourceRows),
      analysis_warnings: warningsToSheet(analysisResult && analysisResult.warnings),
      paired_readiness: pairedReadinessToSheet(analysisResult && analysisResult.pairedReadiness),
      report_figures: reportFiguresToSheet(reportPackage && reportPackage.figures),
      report_scopes: reportScopesToSheet(reportPackage && reportPackage.scopes),
      report_readiness: reportReadinessToSheet(reportPackage && reportPackage.readiness),
    }
  }

  function buildReportHtml(project, analysisResult, reportPackage) {
    const normalized = project && typeof project === 'object' ? project : {}
    const result = analysisResult && typeof analysisResult === 'object' ? analysisResult : {}
    const report = reportPackage && typeof reportPackage === 'object' ? reportPackage : {}
    const plan = result.plan || report.analysisPlan || {}
    const title = report.title || normalized.title || 'Untitled ERG project'
    const summary = report.summary || {}
    const generatedAt = new Date().toISOString()
    const readinessRows = Array.isArray(report.readiness) ? report.readiness : []
    const reportFigures = Array.isArray(report.figures) ? report.figures : []
    const reportScopes = Array.isArray(report.scopes) ? report.scopes : []
    const warnings = Array.isArray(result.warnings) ? result.warnings : []
    const sourceRows = Array.isArray(result.sourceRows) ? result.sourceRows : []
    const cohortSummary = Array.isArray(result.cohortSummary) ? result.cohortSummary : []
    const conditionSummary = Array.isArray(result.conditionSummary) ? result.conditionSummary : []
    const stats = result.stats || {}

    return [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${escapeHtml(title)} - ERG Viewer Report</title>`,
      '<style>',
      reportCss(),
      '</style>',
      '</head>',
      '<body>',
      '<main>',
      '<section class="hero">',
      '<div>',
      '<p class="eyebrow">ERG Viewer report</p>',
      `<h1>${escapeHtml(title)}</h1>`,
      `<p>${escapeHtml(plan.sourceType || 'All')} / ${escapeHtml(plan.protocolMode || 'All')} / ${escapeHtml(plan.protocolFamily || 'All')} / ${escapeHtml(plan.condition || 'All')} / ${escapeHtml(metricDisplayLabel(plan.metricKey))} (${escapeHtml(plan.metricVersion || '')})</p>`,
      '</div>',
      '<dl class="summary-grid">',
      summaryItem('Records', summary.records),
      summaryItem('Included', summary.included),
      summaryItem('Figures', summary.figures),
      summaryItem('Warnings', summary.warnings),
      '</dl>',
      '</section>',
      '<section class="section two-col">',
      reportCard(
        'Analysis Plan',
        definitionList([
          ['Source type', plan.sourceType || 'All'],
          ['Protocol', plan.protocolMode || 'All'],
          ['Family', plan.protocolFamily || 'All'],
          ['Stimulus', plan.condition || 'All'],
          ['Metric', metricDisplayLabel(plan.metricKey)],
          ['Layer', plan.metricVersion || ''],
          ['Biological unit', designLabel('biologicalUnit', plan.biologicalUnit)],
          ['Eye handling', designLabel('eyeAggregation', plan.eyeAggregation)],
          ['Comparison design', designLabel('comparisonDesign', plan.comparisonDesign)],
          ['Stats policy', plan.statsPolicy || ''],
        ])
      ),
      reportCard('Report Scope', reportScopeList(reportScopes, report.reportScope)),
      reportCard(
        'Statistics',
        definitionList([
          ['Status', stats.status || ''],
          ['Test', stats.test || ''],
          ['Message', stats.message || ''],
          ['Mean diff', formatNumber(stats.meanDiff)],
          ['p value', formatNumber(stats.pValue)],
          ['Effect size', formatNumber(stats.effectSize)],
        ])
      ),
      '</section>',
      '<section class="section">',
      '<h2>Publication Figure Plan</h2>',
      figurePlanHtml(reportFigures),
      '</section>',
      '<section class="section">',
      '<h2>Rendered Figures</h2>',
      figureHtml(normalized, result, report),
      '</section>',
      '<section class="section two-col">',
      reportCard('Readiness', readinessList(readinessRows)),
      reportCard('Warnings', warningList(warnings)),
      '</section>',
      '<section class="section">',
      '<h2>Summary Tables</h2>',
      '<h3>Stimulus summary</h3>',
      summaryTable(conditionSummary),
      '<h3>Group summary</h3>',
      summaryTable(cohortSummary),
      '</section>',
      '<section class="section">',
      '<h2>Source Data Preview</h2>',
      sourceTable(sourceRows.slice(0, 40)),
      sourceRows.length > 40
        ? `<p class="note">Showing first 40 of ${escapeHtml(sourceRows.length)} source rows. Full source data are in the XLSX export.</p>`
        : '',
      '</section>',
      '<footer>',
      `<span>Generated ${escapeHtml(generatedAt)}</span>`,
      `<span>${escapeHtml(sourceRows.length)} source rows</span>`,
      '</footer>',
      '</main>',
      '</body>',
      '</html>',
    ].join('')
  }

  function reportCss() {
    return `
      :root { color: #172033; background: #f5f7fb; font-family: "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", Arial, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f7fb; color: #172033; }
      main { max-width: 1100px; margin: 0 auto; padding: 32px; }
      .hero, .card, .section { background: #fff; border: 1px solid #d8e0ea; border-radius: 12px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05); }
      .hero { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; padding: 28px; align-items: end; }
      .eyebrow { margin: 0 0 8px; color: #667085; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
      h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }
      h2 { margin: 0 0 14px; font-size: 18px; line-height: 1.25; }
      h3 { margin: 18px 0 8px; font-size: 14px; line-height: 1.25; }
      p { margin: 0; color: #5f6f85; font-size: 13px; line-height: 1.5; }
      .section { margin-top: 18px; padding: 22px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; background: transparent; border: 0; box-shadow: none; padding: 0; }
      .card { padding: 18px; }
      .summary-grid { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .summary-grid div { min-width: 0; border: 1px solid #d8e0ea; border-radius: 10px; padding: 12px; background: #f8fafc; }
      dt { color: #667085; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      dd { margin: 5px 0 0; font-size: 18px; font-weight: 700; }
      .key-value { margin: 0; display: grid; gap: 8px; }
      .key-value div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 12px; padding-bottom: 7px; border-bottom: 1px solid #edf1f6; }
      .key-value dt, .key-value dd { margin: 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
      .key-value dd { color: #172033; }
      .figure { margin-top: 14px; padding: 14px; border: 1px solid #d8e0ea; border-radius: 10px; background: #fbfcfe; break-inside: avoid; }
      .figure-title { margin: 0 0 10px; color: #344054; font-size: 13px; font-weight: 700; }
      .figure-plan { margin: 0; display: grid; gap: 8px; }
      .figure-plan-row { display: grid; grid-template-columns: 88px 1fr 128px 2fr; gap: 10px; align-items: start; padding: 10px 0; border-bottom: 1px solid #edf1f6; font-size: 12px; line-height: 1.4; }
      .figure-plan-row:last-child { border-bottom: 0; }
      .figure-plan-row strong { font-size: 12px; font-weight: 700; color: #172033; }
      .badge { display: inline-flex; width: max-content; align-items: center; min-height: 22px; padding: 0 8px; border: 1px solid #b7d7cf; border-radius: 999px; background: #ecfdf7; color: #0f766e; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .badge.blocked { border-color: #f1c27d; background: #fffbeb; color: #b45309; }
      svg { width: 100%; height: auto; display: block; background: #fff; border: 1px solid #edf1f6; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
      th, td { padding: 8px 7px; border-bottom: 1px solid #e5eaf1; text-align: left; vertical-align: top; }
      th { color: #667085; background: #f8fafc; font-weight: 700; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .status-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
      .status-list li { display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: 8px; align-items: start; font-size: 12px; line-height: 1.4; }
      .dot { width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; background: #0f8a7c; }
      .warn .dot { background: #b45309; }
      .error .dot { background: #b42318; }
      .note, footer { color: #667085; font-size: 11px; }
      footer { display: flex; justify-content: space-between; margin-top: 18px; padding: 12px 2px; }
      @media print {
        body { background: #fff; }
        main { padding: 18mm; max-width: none; }
        .hero, .card, .section { box-shadow: none; }
        .section { break-inside: avoid; }
      }
    `
  }

  function summaryItem(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value == null ? '' : value)}</dd></div>`
  }

  function reportCard(title, body) {
    return `<section class="card"><h2>${escapeHtml(title)}</h2>${body}</section>`
  }

  function definitionList(rows) {
    return `<dl class="key-value">${rows
      .map(
        ([label, value]) =>
          `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value == null ? '' : value)}</dd></div>`
      )
      .join('')}</dl>`
  }

  function readinessList(rows) {
    const items = rows && rows.length ? rows : [{ label: 'No readiness rows available.', status: 'warn' }]
    return `<ul class="status-list">${items
      .map(
        (row) =>
          `<li class="${escapeHtml(row.status || 'ok')}"><span class="dot"></span><span>${escapeHtml(row.label || '')}</span></li>`
      )
      .join('')}</ul>`
  }

  function warningList(rows) {
    const items = rows && rows.length ? rows : [{ message: 'No analysis warnings.', level: 'ok' }]
    return `<ul class="status-list">${items
      .map(
        (row) =>
          `<li class="${escapeHtml(row.level || 'ok')}"><span class="dot"></span><span>${escapeHtml(row.message || row.code || '')}</span></li>`
      )
      .join('')}</ul>`
  }

  function figurePlanHtml(rows) {
    const figures = Array.isArray(rows) ? rows : []
    if (!figures.length) return '<p class="note">No publication figure plan is available.</p>'
    return `<div class="figure-plan">${figures
      .map(
        (figure) =>
          `<div class="figure-plan-row"><span class="badge ${figure.status === 'blocked' ? 'blocked' : ''}">${escapeHtml(figure.status || '')}</span><strong>${escapeHtml(figure.title || '')}</strong><span>${escapeHtml(figure.kind || '')}</span><span>${escapeHtml(figure.detail || '')}</span></div>`
      )
      .join('')}</div>`
  }

  function figureHtml(project, result, report) {
    const figures = []
    const analysisPanels = publicationPanelsHtml(result)
    if (analysisPanels) figures.push(analysisPanels)
    const publicationFigures = analysisPanels ? '' : publicationFigureHtml(project, report)
    if (publicationFigures) figures.push(publicationFigures)
    if (result && result.waveformSummary && result.waveformSummary.status === 'ok') {
      figures.push(
        `<div class="figure"><p class="figure-title">FVEP average waveform - ${escapeHtml(result.waveformSummary.condition || '')}</p>${waveformSvg(result.waveformSummary.series)}</div>`
      )
    }
    if (result && Array.isArray(result.conditionSummary) && result.conditionSummary.length) {
      figures.push(
        `<div class="figure"><p class="figure-title">Stimulus-response summary</p>${conditionSvg(result.conditionSummary)}</div>`
      )
    }
    if (result && Array.isArray(result.cohortSummary) && result.cohortSummary.length) {
      figures.push(
        `<div class="figure"><p class="figure-title">Group summary</p>${barSvg(result.cohortSummary)}</div>`
      )
    }
    return figures.length ? figures.join('') : '<p>No reportable figure for the current analysis plan.</p>'
  }

  function publicationPanelsHtml(result) {
    const panels = Array.isArray(result && result.publicationPanels) ? result.publicationPanels : []
    const readyPanels = panels.filter((panel) => panel && panel.status === 'ready' && Array.isArray(panel.summaryRows))
    if (!readyPanels.length) return ''
    return readyPanels
      .map((panel) => {
        const chart =
          panel.summaryRows.length > 1 ? conditionSvg(panel.summaryRows) : barSvg(panel.summaryRows)
        return `<div class="figure publication-panel" data-metric="${escapeHtml(panel.metricKey || '')}"><p class="figure-title">${escapeHtml(panel.title || panel.metricLabel || '')}</p><p class="note">${escapeHtml(panel.scientificRole || '')}</p>${withAxisOverride(chart, panel.yAxisLabel || panel.metricLabel || 'Mean +/- SEM')}</div>`
      })
      .join('')
  }

  function publicationFigureHtml(project, report) {
    const scope = report && report.reportScope
    if (scope === 'erg-preset') return ergPublicationFigureHtml(project)
    if (scope === 'fvep-preset') return fvepPublicationFigureHtml(project)
    return ''
  }

  function ergPublicationFigureHtml(project) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const rows = samples
      .filter((sample) => sourceTypeFromMode(sample.mode) === 'ERG' && sample.included !== false)
      .flatMap((sample) => publicationMetricRows(sample))
    const panels = [
      publicationPanel(rows, 'aAmplitudeUv', 'a-wave amp response', 'A-wave amp (µV)'),
      publicationPanel(rows, 'bAmplitudeUv', 'b-wave amp response', 'B-wave amp (µV)'),
      publicationPanel(rows, 'sumOpAmplitudeUv', 'OP/dOps summed amp', 'Summed OP amp (µV)'),
      publicationPanel(rows, 'flickerAmplitudeUv', 'Flicker amp summary', 'Flicker amp (µV)'),
      publicationPanel(rows, 'flickerPhaseDeg', 'Flicker phase summary', 'Flicker phase (deg)'),
    ].filter(Boolean)
    return panels.join('')
  }

  function fvepPublicationFigureHtml(project) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const rows = samples
      .filter((sample) => sourceTypeFromMode(sample.mode) === 'FVEP' && sample.included !== false)
      .flatMap((sample) => publicationMetricRows(sample))
    const panels = [
      publicationPanel(rows, 'p1n1AmplitudeUv', 'P1-N1 amp summary', 'P1-N1 amp (µV)'),
      publicationPanel(rows, 'p1n2AmplitudeUv', 'P1-N2 amp summary', 'P1-N2 amp (µV)'),
      publicationPanel(rows, 'p2n2AmplitudeUv', 'P2-N2 amp summary', 'P2-N2 amp (µV)'),
      publicationPanel(rows, 'n1LatencyMs', 'N1 latency summary', 'N1 latency (ms)'),
      publicationPanel(rows, 'p1LatencyMs', 'P1 latency summary', 'P1 latency (ms)'),
      publicationPanel(rows, 'n2LatencyMs', 'N2 latency summary', 'N2 latency (ms)'),
      publicationPanel(rows, 'p2LatencyMs', 'P2 latency summary', 'P2 latency (ms)'),
    ].filter(Boolean)
    return panels.join('')
  }

  function publicationMetricRows(sample) {
    const raw = (sample.metrics && sample.metrics.raw) || metrics.deriveRawMetrics(sample)
    return Object.keys(raw || {})
      .filter((metricKey) => Number.isFinite(Number(raw[metricKey])))
      .map((metricKey) => {
        const meta = parsePublicationCondition(sample.condition || '')
        return {
          sampleId: sample.id || '',
          subjectId: sample.subjectId || '',
          cohort: sample.cohort || 'Unassigned',
          mode: sample.mode || '',
          condition: sample.condition || '',
          conditionShort: meta.shortLabel,
          protocolFamily: sourceTypeFromMode(sample.mode) === 'FVEP' ? 'FVEP' : meta.protocolFamily || sample.mode || '',
          protocolIndex: meta.protocolIndex,
          stimulusValue: meta.stimulusValue,
          stimulusUnit: meta.stimulusUnit,
          metric: metricKey,
          mean: Number(raw[metricKey]),
          sem: 0,
          n: 1,
        }
      })
  }

  function publicationPanel(rows, metricKey, title, yLabel) {
    const data = (rows || []).filter((row) => row.metric === metricKey && Number.isFinite(Number(row.mean)))
    if (!data.length) return ''
    const summary = summarizePublicationRows(data)
    const chart = summary.length > 1 ? conditionSvg(summary) : barSvg(summary)
    return `<div class="figure publication-panel" data-metric="${escapeHtml(metricKey)}"><p class="figure-title">${escapeHtml(title)}</p>${withAxisOverride(chart, yLabel)}</div>`
  }

  function summarizePublicationRows(rows) {
    const buckets = new Map()
    ;(rows || []).forEach((row) => {
      const key = [row.condition || '', row.cohort || 'Unassigned'].join('||')
      const existing =
        buckets.get(key) ||
        {
          cohort: row.cohort || 'Unassigned',
          condition: row.condition || '',
          conditionShort: row.conditionShort || '',
          protocolFamily: row.protocolFamily || '',
          protocolIndex: row.protocolIndex,
          stimulusValue: row.stimulusValue,
          stimulusUnit: row.stimulusUnit,
          values: [],
        }
      existing.values.push(Number(row.mean))
      buckets.set(key, existing)
    })
    return Array.from(buckets.values()).map((row) => {
      const n = row.values.length
      const mean = n ? row.values.reduce((sum, value) => sum + value, 0) / n : null
      const sd =
        n > 1 ? Math.sqrt(row.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0
      return {
        ...row,
        n,
        mean: round(mean, 4),
        sd: round(sd, 4),
        sem: round(n > 1 ? sd / Math.sqrt(n) : 0, 4),
      }
    })
  }

  function withAxisOverride(svg, yLabel) {
    return String(svg || '').replace(/Mean \+\/- SEM/g, escapeHtml(yLabel || 'Mean +/- SEM'))
  }

  function waveformSvg(series) {
    const rows = (series || []).filter(
      (row) => Array.isArray(row.x) && Array.isArray(row.meanY) && row.x.length
    )
    if (!rows.length) return emptySvg('No waveform data')
    const xValues = rows.flatMap((row) => row.x.map(Number)).filter(Number.isFinite)
    const yValues = rows.flatMap((row) => row.meanY.map(Number)).filter(Number.isFinite)
    const scale = makeScale(xValues, yValues, 620, 260, 50, 24, 24, 40)
    const colors = ['#2563eb', '#0f766e', '#b45309', '#9333ea']
    const paths = rows
      .map((row, index) => {
        const points = row.x
          .map((x, pointIndex) => [Number(x), Number(row.meanY[pointIndex])])
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
        const d = points
          .map(([x, y], pointIndex) => `${pointIndex ? 'L' : 'M'}${scale.x(x)} ${scale.y(y)}`)
          .join(' ')
        return `<path d="${d}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="2"/><text x="${60 + index * 110}" y="22" fill="${colors[index % colors.length]}" font-size="11">${escapeHtml(row.cohort || '')} n=${escapeHtml(row.n || 0)}</text>`
      })
      .join('')
    return chartFrame(paths, 'Time (ms)', 'Amp (µV)', scale)
  }

  function conditionSvg(rows) {
    const data = (rows || []).filter((row) => Number.isFinite(Number(row.mean)))
    if (!data.length) return emptySvg('No stimulus summary')
    const conditions = unique(data.map((row) => row.condition || 'All')).sort((left, right) =>
      conditionSort(left, right, data)
    )
    const stimulusAxis = buildStimulusAxis(data, conditions)
    const cohorts = unique(data.map((row) => row.cohort || 'Unassigned'))
    const yValues = data.flatMap((row) => [
      Number(row.mean),
      Number(row.mean) + Number(row.sem || 0),
      Number(row.mean) - Number(row.sem || 0),
    ])
    const scale = makeScale(stimulusAxis.domain, yValues, 620, 260, 66, 64, 24, 58)
    const colors = ['#2563eb', '#0f766e', '#b45309', '#9333ea']
    const pieces = cohorts
      .map((cohort, cohortIndex) => {
        const points = conditions
          .map((condition, index) => {
            const row = data.find(
              (item) => (item.cohort || 'Unassigned') === cohort && (item.condition || 'All') === condition
            )
            return row ? [stimulusAxis.xValue(condition, index), Number(row.mean), row] : null
          })
          .filter(Boolean)
        const paths = conditionSegments(points)
          .map(
            (segment) =>
              `<path data-family="${escapeHtml(segment.family)}" d="${segment.points.map(([x, y], index) => `${index ? 'L' : 'M'}${scale.x(x)} ${scale.y(y)}`).join(' ')}" fill="none" stroke="${colors[cohortIndex % colors.length]}" stroke-width="2"/>`
          )
          .join('')
        const dots = points
          .map(([x, y, row]) => {
            const sem = Number(row.sem || 0)
            return `<line x1="${scale.x(x)}" x2="${scale.x(x)}" y1="${scale.y(y - sem)}" y2="${scale.y(y + sem)}" stroke="${colors[cohortIndex % colors.length]}" stroke-width="1"/><circle cx="${scale.x(x)}" cy="${scale.y(y)}" r="4" fill="${colors[cohortIndex % colors.length]}"/>`
          })
          .join('')
        return `${paths}${dots}<text x="${60 + cohortIndex * 110}" y="22" fill="${colors[cohortIndex % colors.length]}" font-size="11">${escapeHtml(cohort)}</text>`
      })
      .join('')
    const labels = conditions
      .map(
        (condition, index) =>
          `<text x="${scale.x(stimulusAxis.xValue(condition, index))}" y="240" text-anchor="middle" font-size="10" fill="#667085">${escapeHtml(stimulusAxis.labelValue(condition, data))}</text>`
      )
      .join('')
    return chartFrame(`${pieces}${labels}`, stimulusAxis.label, 'Mean +/- SEM', scale)
  }

  function barSvg(rows) {
    const data = (rows || []).filter((row) => Number.isFinite(Number(row.mean)))
    if (!data.length) return emptySvg('No group summary')
    const yValues = data.flatMap((row) => [0, Number(row.mean), Number(row.mean) + Number(row.sem || 0)])
    const scale = makeScale([0, Math.max(data.length, 1)], yValues, 620, 260, 50, 24, 24, 58)
    const barWidth = Math.max(22, Math.min(54, (scale.plotWidth / data.length) * 0.62))
    const colors = ['#2563eb', '#0f766e', '#b45309', '#9333ea']
    const zero = scale.y(0)
    const bars = data
      .map((row, index) => {
        const x = scale.x(index + 0.5)
        const y = scale.y(Number(row.mean))
        const height = Math.max(1, Math.abs(zero - y))
        const top = Math.min(y, zero)
        const sem = Number(row.sem || 0)
        return `<rect x="${x - barWidth / 2}" y="${top}" width="${barWidth}" height="${height}" rx="4" fill="${colors[index % colors.length]}"/><line x1="${x}" x2="${x}" y1="${scale.y(Number(row.mean) - sem)}" y2="${scale.y(Number(row.mean) + sem)}" stroke="#172033" stroke-width="1"/><text x="${x}" y="240" text-anchor="middle" font-size="10" fill="#667085">${escapeHtml(shortLabel(row.cohort || ''))}</text>`
      })
      .join('')
    return chartFrame(bars, 'Group', 'Mean +/- SEM', scale)
  }

  function chartFrame(content, xLabel, yLabel, scale) {
    const yTicks = [scale.yMin, (scale.yMin + scale.yMax) / 2, scale.yMax]
      .map(
        (value) =>
          `<text x="44" y="${scale.y(value) + 4}" text-anchor="end" font-size="10" fill="#667085">${escapeHtml(formatNumber(value))}</text>`
      )
      .join('')
    return `<svg viewBox="0 0 ${scale.width} ${scale.height}" role="img" aria-label="${escapeHtml(xLabel)} by ${escapeHtml(yLabel)}"><line x1="${scale.left}" y1="${scale.bottomY}" x2="${scale.rightX}" y2="${scale.bottomY}" stroke="#9aa7b7"/><line x1="${scale.left}" y1="${scale.top}" x2="${scale.left}" y2="${scale.bottomY}" stroke="#9aa7b7"/>${yTicks}<text x="${scale.width / 2}" y="${scale.height - 12}" text-anchor="middle" font-size="11" fill="#344054">${escapeHtml(xLabel)}</text><text x="14" y="${scale.height / 2}" transform="rotate(-90 14 ${scale.height / 2})" text-anchor="middle" font-size="11" fill="#344054">${escapeHtml(yLabel)}</text>${content}</svg>`
  }

  function emptySvg(label) {
    return `<svg viewBox="0 0 620 180" role="img" aria-label="${escapeHtml(label)}"><text x="310" y="92" text-anchor="middle" font-size="13" fill="#667085">${escapeHtml(label)}</text></svg>`
  }

  function makeScale(xValues, yValues, width, height, left, right, top, bottom) {
    const finiteX = xValues.filter(Number.isFinite)
    const finiteY = yValues.filter(Number.isFinite)
    const xMin = finiteX.length ? Math.min(...finiteX) : 0
    const xMaxRaw = finiteX.length ? Math.max(...finiteX) : 1
    const yMinRaw = finiteY.length ? Math.min(...finiteY) : 0
    const yMaxRaw = finiteY.length ? Math.max(...finiteY) : 1
    const xMax = xMaxRaw === xMin ? xMin + 1 : xMaxRaw
    const yPad = Math.max(1, Math.abs(yMaxRaw - yMinRaw) * 0.12)
    const yMin = yMaxRaw === yMinRaw ? yMinRaw - yPad : yMinRaw - yPad
    const yMax = yMaxRaw === yMinRaw ? yMaxRaw + yPad : yMaxRaw + yPad
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      rightX: width - right,
      bottomY: height - bottom,
      plotWidth,
      plotHeight,
      yMin,
      yMax,
      x: (value) => round(left + ((Number(value) - xMin) / (xMax - xMin)) * plotWidth, 2),
      y: (value) => round(top + ((yMax - Number(value)) / (yMax - yMin)) * plotHeight, 2),
    }
  }

  function summaryTable(rows) {
    if (!rows || !rows.length) return '<p class="note">No rows.</p>'
    return `<table><thead><tr>${['Group', 'Stimulus', 'n', 'Mean', 'SD', 'SEM'].map((head) => `<th>${head}</th>`).join('')}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.cohort || '')}</td><td>${escapeHtml(row.condition || '')}</td><td class="num">${escapeHtml(row.n || 0)}</td><td class="num">${escapeHtml(formatNumber(row.mean))}</td><td class="num">${escapeHtml(formatNumber(row.sd))}</td><td class="num">${escapeHtml(formatNumber(row.sem))}</td></tr>`
      )
      .join('')}</tbody></table>`
  }

  function sourceTable(rows) {
    if (!rows || !rows.length) return '<p class="note">No source rows.</p>'
    const fields = ['subjectId', 'cohort', 'included', 'mode', 'condition', 'metric', 'version', 'value']
    return `<table><thead><tr>${['Subject', 'Group', 'In', 'Mode', 'Stimulus', 'Metric', 'Layer', 'Value'].map((head) => `<th>${head}</th>`).join('')}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr>${fields
            .map((field) => {
              const value =
                field === 'metric'
                  ? metricDisplayLabel(row[field])
                  : field === 'value'
                    ? formatNumber(row[field])
                    : row[field]
              return `<td class="${field === 'value' ? 'num' : ''}">${escapeHtml(value)}</td>`
            })
            .join('')}</tr>`
      )
      .join('')}</tbody></table>`
  }

  function metricDisplayLabel(metricKey) {
    return metricKey ? protocols.metricLabel(metricKey) : ''
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter((value) => value != null && value !== '')))
  }

  function shortLabel(value) {
    const text = String(value == null ? '' : value)
    return text.length > 18 ? `${text.slice(0, 15)}...` : text
  }

  function conditionAxisLabel(condition, rows) {
    const row = (rows || []).find((item) => (item.condition || 'All') === condition)
    return shortLabel((row && row.conditionShort) || condition)
  }

  function conditionSort(left, right, rows) {
    const leftMeta = conditionMeta(left, rows)
    const rightMeta = conditionMeta(right, rows)
    if (Number.isFinite(leftMeta.protocolIndex) && Number.isFinite(rightMeta.protocolIndex)) {
      return leftMeta.protocolIndex - rightMeta.protocolIndex
    }
    if (Number.isFinite(leftMeta.stimulusValue) && Number.isFinite(rightMeta.stimulusValue)) {
      return leftMeta.stimulusValue - rightMeta.stimulusValue
    }
    return String(left || '').localeCompare(String(right || ''))
  }

  function conditionMeta(condition, rows) {
    const row = (rows || []).find((item) => (item.condition || 'All') === condition) || {}
    return {
      protocolIndex: Number(row.protocolIndex),
      stimulusValue: Number(row.stimulusValue),
    }
  }

  function parsePublicationCondition(condition) {
    const text = String(condition || '').trim()
    const parts = text
      .split(/\s+·\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
    const protocol = parts[0] || text
    const stimulus = parts[1] || ''
    const protocolMatch = protocol.match(/^([A-Za-z]+)\((\d+)\)_([^\s·]+)/)
    const stimulusMatch = stimulus.match(/([bf]?)白色光:\s*([+-]?\d+(?:\.\d+)?)(.*)$/i)
    const protocolFamily = protocolMatch ? protocolMatch[3] : protocol
    const stimulusValue = stimulusMatch ? Number(stimulusMatch[2]) : null
    const stimulusTail = stimulusMatch ? String(stimulusMatch[3] || '') : ''
    const stimulusUnit = stimulusMatch ? normalizeStimulusUnit(stimulusTail.replace(/[,，].*$/g, '').replace(/\(.*$/g, '').trim()) : ''
    const durationMatch = stimulusTail.match(/(?:[,，]|\()\s*([+-]?\d+(?:\.\d+)?)\s*ms/i)
    const durationMs = durationMatch ? Number(durationMatch[1]) : null
    return {
      protocolIndex: protocolMatch ? Number(protocolMatch[2]) : null,
      protocolFamily,
      stimulusValue: Number.isFinite(stimulusValue) ? stimulusValue : null,
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      stimulusUnit,
      shortLabel: makeConditionShortLabel({
        protocolFamily,
        stimulusValue,
        fallback: protocol || text,
      }),
    }
  }

  function makeConditionShortLabel(meta) {
    if (meta.stimulusValue != null && Number.isFinite(Number(meta.stimulusValue))) {
      const value = formatCompactNumber(meta.stimulusValue)
      return `${meta.protocolFamily || 'Stimulus'} ${value}`.trim()
    }
    return String(meta.fallback || 'Stimulus').trim()
  }

  function normalizeStimulusUnit(unit) {
    const text = String(unit || '').replace(/\s+/g, '')
    if (/cd\.?s\/?m-?2|cd·s\/m|cd\.s\/m2/i.test(text)) return 'cd·s·m⁻²'
    if (/cd\.?m-?2|cd\/m2|cd·m/i.test(text)) return 'cd·m⁻²'
    return text
  }

  function formatCompactNumber(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return ''
    return Number.isInteger(number) ? String(number) : String(round(number, 3))
  }

  function sourceTypeFromMode(mode) {
    return String(mode || '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
  }

  function buildStimulusAxis(rows, conditions) {
    const values = new Map()
    const units = new Set()
    ;(conditions || []).forEach((condition) => {
      const row = (rows || []).find((item) => (item.condition || 'All') === condition) || {}
      const value = Number(row.stimulusValue)
      if (Number.isFinite(value)) values.set(condition, value)
      if (row.stimulusUnit) units.add(normalizeStimulusUnit(row.stimulusUnit))
    })
    const numericValues = Array.from(values.values())
    const enabled = conditions.length > 1 && values.size === conditions.length && units.size <= 1
    const min = numericValues.length ? Math.min(...numericValues) : 0
    const max = numericValues.length ? Math.max(...numericValues) : Math.max(conditions.length - 1, 1)
    const unit = units.size === 1 ? Array.from(units)[0] : ''
    return {
      enabled,
      domain: enabled ? [min, max === min ? min + 1 : max] : [0, Math.max(conditions.length - 1, 1)],
      label: enabled && unit ? `Stimulus (${unit})` : 'Stimulus',
      xValue: (condition, index) => (enabled ? values.get(condition) : index),
      labelValue: (condition, data) =>
        enabled ? formatNumber(values.get(condition)) : conditionAxisLabel(condition, data),
    }
  }

  function conditionSegments(points) {
    const segments = []
    ;(points || []).forEach((point) => {
      const row = point[2] || {}
      const family = row.protocolFamily || 'Protocol'
      const last = segments[segments.length - 1]
      if (!last || last.family !== family) {
        segments.push({ family, points: [point] })
      } else {
        last.points.push(point)
      }
    })
    return segments
  }

  function formatNumber(value) {
    if (!Number.isFinite(Number(value))) return value == null ? '' : String(value)
    const rounded = round(Number(value), Math.abs(Number(value)) < 1 ? 4 : 2)
    return String(rounded)
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function analysisPlanToSheet(plan) {
    const fields = [
      ['sourceType', 'sourceType'],
      ['protocolMode', 'protocolMode'],
      ['protocolFamily', 'protocolFamily'],
      ['stimulus', 'condition'],
      ['metricKey', 'metricKey'],
      ['metricVersion', 'metricVersion'],
      ['grouping', 'grouping'],
      ['statsPolicy', 'statsPolicy'],
      ['biologicalUnit', 'biologicalUnit'],
      ['eyeAggregation', 'eyeAggregation'],
      ['comparisonDesign', 'comparisonDesign'],
    ]
    return [
      ['field', 'value'],
      ...fields.map(([label, field]) => [
        label,
        field === 'grouping' && plan && plan[field] === 'cohort'
          ? 'group'
          : plan && plan[field] != null
            ? plan[field]
            : '',
      ]),
    ]
  }

  function analysisRowsToSheet(rows) {
    const header = [
      'sample_id',
      'subject_id',
      'acquisition_id',
      'paired_id',
      'sample',
      'group',
      'included',
      'source_type',
      'mode',
      'stimulus',
      'stimulus_short',
      'protocol_family',
      'protocol_index',
      'adaptation',
      'stimulus_value',
      'stimulus_unit',
      'stimulus_duration_ms',
      'source_name',
      'metric',
      'unit',
      'version',
      'source',
      'biological_unit',
      'eye_aggregation',
      'comparison_design',
      'value',
    ]
    return [
      header,
      ...((rows || []).map((row) => [
        row.sampleId || '',
        row.subjectId || '',
        row.acquisitionId || '',
        row.pairedId || '',
        row.sample || '',
        row.cohort || '',
        row.included !== false,
        row.sourceType || '',
        row.mode || '',
        row.condition || '',
        row.conditionShort || '',
        row.protocolFamily || '',
        row.protocolIndex,
        row.adaptation || '',
        row.stimulusValue,
        row.stimulusUnit || '',
        row.stimulusDurationMs,
        row.sourceName || '',
        row.metric || '',
        row.unit || '',
        row.version || '',
        row.source || '',
        row.biologicalUnit || '',
        row.eyeAggregation || '',
        row.comparisonDesign || '',
        row.value,
      ]) || []),
    ]
  }

  function statisticalDesignToSheet(settings) {
    const design = settings || {}
    return [
      ['field', 'value', 'label'],
      [
        'biologicalUnit',
        design.biologicalUnit || 'subject',
        designLabel('biologicalUnit', design.biologicalUnit),
      ],
      [
        'eyeAggregation',
        design.eyeAggregation || 'average-eyes',
        designLabel('eyeAggregation', design.eyeAggregation),
      ],
      [
        'comparisonDesign',
        design.comparisonDesign || 'independent',
        designLabel('comparisonDesign', design.comparisonDesign),
      ],
    ]
  }

  function designLabel(field, value) {
    const labels = {
      biologicalUnit: {
        subject: 'Subject/animal',
        acquisition: 'Acquisition record',
      },
      eyeAggregation: {
        'average-eyes': 'Average right and left eyes',
        'right-eye': 'Right eye only',
        'left-eye': 'Left eye only',
      },
      comparisonDesign: {
        independent: 'Independent groups',
        paired: 'Paired/repeated measures',
      },
    }
    return (labels[field] && labels[field][value]) || value || ''
  }

  function warningsToSheet(warnings) {
    return [
      ['code', 'level', 'message'],
      ...((warnings || []).map((warning) => [
        warning.code || '',
        warning.level || '',
        warning.message || '',
      ]) || []),
    ]
  }

  function pairedReadinessToSheet(rows) {
    return [
      ['issue', 'level', 'stimulus', 'group', 'paired_id', 'sample_ids', 'message'],
      ...((rows || []).map((row) => [
        row.issue || '',
        row.level || '',
        row.condition || '',
        row.cohort || '',
        row.pairedId || '',
        Array.isArray(row.sampleIds) ? row.sampleIds.join(', ') : '',
        row.message || '',
      ]) || []),
    ]
  }

  function reportReadinessToSheet(rows) {
    return [['status', 'label'], ...((rows || []).map((row) => [row.status || '', row.label || '']) || [])]
  }

  function reportFiguresToSheet(rows) {
    return [
      ['id', 'title', 'kind', 'status', 'detail'],
      ...((rows || []).map((row) => [
        row.id || '',
        row.title || '',
        row.kind || '',
        row.status || '',
        row.detail || '',
      ]) || []),
    ]
  }

  function reportScopesToSheet(rows) {
    return [
      ['id', 'title', 'active', 'records', 'ready_figures', 'total_figures', 'blocked_figures', 'detail'],
      ...((rows || []).map((row) => [
        row.id || '',
        row.title || '',
        row.active ? true : false,
        row.records || 0,
        row.readyFigures || 0,
        row.totalFigures || 0,
        row.blockedFigures || 0,
        row.detail || '',
      ]) || []),
    ]
  }

  function reportScopeList(scopes, activeScope) {
    const rows = Array.isArray(scopes) ? scopes : []
    if (!rows.length) return '<p class="note">No report scope metadata is available.</p>'
    return `<table><thead><tr><th>Scope</th><th>Records</th><th>Figures</th><th>Detail</th></tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr><td>${row.active || row.id === activeScope ? 'Active: ' : ''}${escapeHtml(row.title || '')}</td><td class="num">${escapeHtml(row.records || 0)}</td><td class="num">${escapeHtml(row.readyFigures || 0)}/${escapeHtml(row.totalFigures || 0)}</td><td>${escapeHtml(row.detail || '')}</td></tr>`
      )
      .join('')}</tbody></table>`
  }

  function buildMetricRows(samples) {
    return samples.flatMap((sample) => {
      const raw = (sample.metrics && sample.metrics.raw) || metrics.deriveRawMetrics(sample)
      const correctionContext = { ...sample.corrections, mode: sample.mode }
      const manual = metrics.deriveManualMetrics(raw, correctionContext)
      const corrected = metrics.correctedMetrics(raw, correctionContext)
      return [
        ...metricsObjectToRows(sample, raw, 'raw', 'raw'),
        ...metricsObjectToRows(sample, manual, 'manual', 'manual'),
        ...metricsObjectToRows(sample, corrected, 'corrected', (metricKey) =>
          Object.prototype.hasOwnProperty.call(manual, metricKey) ? 'manual' : 'raw-fallback'
        ),
      ]
    })
  }

  function metricsObjectToRows(sample, values, version, source) {
    return Object.keys(values || {})
      .filter((key) => Number.isFinite(Number(values[key])))
      .sort()
      .map((metricKey) => ({
        sampleId: sample.id || '',
        subjectId: sample.subjectId || '',
        acquisitionId: sample.acquisitionId || '',
        label: sample.label || '',
        cohort: sample.cohort || '',
        included: sample.included !== false,
        mode: sample.mode || '',
        condition: sample.condition || '',
        sourceName: sample.sourceName || '',
        metric: metricKey,
        value: Number(values[metricKey]),
        unit: protocols.metricUnit(metricKey) || '',
        version,
        source: typeof source === 'function' ? source(metricKey) : source,
      }))
  }

  function metricRowsToSheet(rows) {
    const header = [
      'sample_id',
      'subject_id',
      'acquisition_id',
      'label',
      'group',
      'included',
      'mode',
      'stimulus',
      'source_name',
      'metric',
      'value',
      'unit',
      'version',
      'source',
    ]
    return [
      header,
      ...(rows || []).map((row) => [
        row.sampleId,
        row.subjectId,
        row.acquisitionId,
        row.label,
        row.cohort,
        row.included,
        row.mode,
        row.condition,
        row.sourceName,
        row.metric,
        row.value,
        row.unit,
        row.version,
        row.source,
      ]),
    ]
  }

  function buildCohortSummary(metricRows) {
    const buckets = new Map()
    ;(metricRows || []).forEach((row) => {
      if (row.included === false || !Number.isFinite(Number(row.value))) return
      const key = [
        row.version,
        row.mode,
        row.condition,
        row.metric,
        row.unit,
        row.cohort || 'Unassigned',
      ].join('||')
      if (!buckets.has(key)) {
        buckets.set(key, {
          version: row.version,
          mode: row.mode,
          condition: row.condition,
          metric: row.metric,
          unit: row.unit,
          cohort: row.cohort || 'Unassigned',
          values: [],
        })
      }
      buckets.get(key).values.push(Number(row.value))
    })
    return Array.from(buckets.values())
      .map((row) => {
        const n = row.values.length
        const mean = n ? row.values.reduce((sum, value) => sum + value, 0) / n : null
        const sd =
          n > 1 ? Math.sqrt(row.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : null
        const sem = n > 1 ? sd / Math.sqrt(n) : null
        return {
          ...row,
          n,
          mean: round(mean, 4),
          sd: round(sd, 4),
          sem: round(sem, 4),
          min: round(Math.min(...row.values), 4),
          max: round(Math.max(...row.values), 4),
        }
      })
      .sort((a, b) =>
        `${a.version} ${a.mode} ${a.condition} ${a.metric} ${a.cohort}`.localeCompare(
          `${b.version} ${b.mode} ${b.condition} ${b.metric} ${b.cohort}`
        )
      )
  }

  function summaryRowsToSheet(rows) {
    const header = [
      'version',
      'mode',
      'stimulus',
      'metric',
      'unit',
      'group',
      'n',
      'mean',
      'sd',
      'sem',
      'min',
      'max',
    ]
    return [
      header,
      ...(rows || []).map((row) => [
        row.version,
        row.mode,
        row.condition,
        row.metric,
        row.unit,
        row.cohort,
        row.n,
        row.mean,
        row.sd,
        row.sem,
        row.min,
        row.max,
      ]),
    ]
  }

  function buildCorrectionRows(samples) {
    return samples.flatMap((sample) => {
      const manual = sample.corrections && sample.corrections.manualPoints
      return ['right', 'left'].flatMap((eye) => {
        const side = manual && manual[eye] ? manual[eye] : {}
        const ordinary = ['a', 'b', 'N1', 'P1', 'N2', 'P2']
          .filter((key) => isPoint(side[key]))
          .map((key) => correctionRow(sample, eye, key, side[key]))
        const ops = Array.isArray(side.ops)
          ? side.ops.flatMap((item, index) => [
              ...(isPoint(item && item.peak)
                ? [correctionRow(sample, eye, `OP${index + 1} peak`, item.peak)]
                : []),
              ...(isPoint(item && item.valley)
                ? [correctionRow(sample, eye, `OP${index + 1} valley`, item.valley)]
                : []),
            ])
          : []
        return [...ordinary, ...ops]
      })
    })
  }

  function correctionRow(sample, eye, point, value) {
    return {
      sampleId: sample.id || '',
      subjectId: sample.subjectId || '',
      acquisitionId: sample.acquisitionId || '',
      mode: sample.mode || '',
      eye,
      point,
      x: Number(value.x),
      y: Number(value.y),
    }
  }

  function isPoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
  }

  function round(value, digits) {
    if (!Number.isFinite(Number(value))) return null
    const factor = 10 ** Number(digits || 0)
    return Math.round(Number(value) * factor) / factor
  }

  return {
    buildProjectWorkbookSheets,
    buildReportHtml,
    buildMetricRows,
    buildCohortSummary,
    buildCorrectionRows,
  }
})
