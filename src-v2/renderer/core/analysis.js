;(function initAnalysis(root, factory) {
  const api = factory(
    root.ERGv2Metrics || (typeof require === 'function' ? require('./metrics') : null),
    root.ERGv2Protocols || (typeof require === 'function' ? require('./protocols') : null)
  )
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2Analysis = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory(metrics, protocols) {
  function buildAnalysisPlan(project, options) {
    const settings = (project && project.settings) || {}
    const sourceType = normalizeChoice(
      options && options.sourceType
        ? options.sourceType
        : settings.analysisSourceType || settings.recordFilter,
      ['All', 'ERG', 'FVEP'],
      'All'
    )
    const plan = {
      sourceType,
      protocolMode: normalizeText(
        (options && options.protocolMode) || settings.analysisProtocolMode || settings.protocolMode || 'All'
      ),
      protocolFamily: normalizeText(
        (options && options.protocolFamily) ||
          settings.analysisProtocolFamily ||
          settings.protocolFamily ||
          'All'
      ),
      condition: normalizeText(
        (options && options.condition) || settings.analysisCondition || settings.condition || 'All'
      ),
      metricKey: normalizeText((options && options.metricKey) || settings.metricKey || 'bAmplitudeUv'),
      metricVersion: normalizeMetricVersion((options && options.metricVersion) || settings.metricVersion),
      grouping: normalizeChoice((options && options.grouping) || settings.grouping, ['cohort'], 'cohort'),
      statsPolicy: normalizeChoice(
        (options && options.statsPolicy) || settings.statsPolicy,
        ['auto', 'descriptive-only', 'welch'],
        'auto'
      ),
      biologicalUnit: normalizeChoice(
        (options && options.biologicalUnit) || settings.biologicalUnit,
        ['subject', 'acquisition'],
        'subject'
      ),
      eyeAggregation: normalizeChoice(
        (options && options.eyeAggregation) || settings.eyeAggregation,
        ['average-eyes', 'right-eye', 'left-eye'],
        'average-eyes'
      ),
      comparisonDesign: normalizeChoice(
        (options && options.comparisonDesign) || settings.comparisonDesign,
        ['independent', 'paired'],
        'independent'
      ),
    }
    plan.metricKey = protocols.compatibleMetricForPlan(plan.metricKey, plan)
    return plan
  }

  function runAnalysis(projectOrSamples, planInput) {
    const samples = Array.isArray(projectOrSamples)
      ? projectOrSamples
      : Array.isArray(projectOrSamples && projectOrSamples.samples)
        ? projectOrSamples.samples
        : []
    const plan = buildAnalysisPlan(
      Array.isArray(projectOrSamples) ? { samples, settings: {} } : projectOrSamples || {},
      planInput || {}
    )
    const sourceRows = samples
      .filter((sample) => sampleMatchesPlan(sample, plan))
      .map((sample) => metricRow(sample, plan))
    const finiteRows = sourceRows.filter((row) => Number.isFinite(Number(row.value)))
    const analysisRows = finiteRows.filter((row) => row.included !== false)
    const cohortSummary = summarizeRows(analysisRows, ['cohort'])
    const conditionSummary = summarizeRows(analysisRows, ['condition', 'cohort'])
    const pairedReadiness = plan.comparisonDesign === 'paired' ? buildPairedReadiness(analysisRows) : []
    const warnings = buildWarnings(
      sourceRows,
      finiteRows,
      analysisRows,
      conditionSummary,
      plan,
      pairedReadiness
    )
    const stats = buildStats(analysisRows, conditionSummary, plan, warnings)
    const waveformSummary = buildWaveformSummary(samples, analysisRows, plan)
    const publicationPanels = buildPublicationPanels(samples, plan)
    return {
      plan,
      scopeLabel: scopeLabel(plan),
      sourceRows,
      finiteRows,
      analysisRows,
      cohortSummary: stats.blockedBy === 'condition-pooling' ? [] : cohortSummary,
      conditionSummary,
      stats,
      warnings,
      pairedReadiness,
      waveformSummary,
      publicationPanels,
      figureSeries: buildFigureSeries(analysisRows, conditionSummary, plan, stats),
      snapshot: buildSnapshot(sourceRows, analysisRows, plan),
    }
  }

  function validateAnalysisPlan(projectOrSamples, planInput) {
    return runAnalysis(projectOrSamples, planInput).warnings
  }

  function availableAnalysisOptions(projectOrSamples, planInput) {
    const samples = Array.isArray(projectOrSamples)
      ? projectOrSamples
      : Array.isArray(projectOrSamples && projectOrSamples.samples)
        ? projectOrSamples.samples
        : []
    const plan = buildAnalysisPlan(
      Array.isArray(projectOrSamples) ? { samples, settings: {} } : projectOrSamples || {},
      planInput || {}
    )
    const sourceTypes = ['All']
    const protocolModes = ['All']
    const protocolFamilies = ['All']
    const conditions = ['All']
    samples.forEach((sample) => {
      const sourceType = sourceTypeFromMode(sample && sample.mode)
      if (sourceType && !sourceTypes.includes(sourceType)) sourceTypes.push(sourceType)
      if (plan.sourceType === 'All' || plan.sourceType === sourceType) {
        const mode = normalizeText(sample && sample.mode)
        if (mode !== 'All' && !protocolModes.includes(mode)) protocolModes.push(mode)
        if (plan.protocolMode === 'All' || plan.protocolMode === mode) {
          const conditionMeta = parseCondition(sample && sample.condition)
          const family = normalizeText(conditionMeta.protocolFamily)
          if (family !== 'All' && !protocolFamilies.includes(family)) protocolFamilies.push(family)
          if (plan.protocolFamily === 'All' || plan.protocolFamily === family) {
            const condition = normalizeText(sample && sample.condition)
            if (condition !== 'All' && !conditions.includes(condition)) conditions.push(condition)
          }
        }
      }
    })
    return {
      sourceTypes,
      protocols: protocolModes.sort(optionSort),
      protocolFamilies: protocolFamilies.sort(optionSort),
      conditions: conditions.sort(optionSort),
      metrics: protocols.metricKeys(),
      metricVersions: ['raw', 'manual'],
      statsPolicies: ['auto', 'descriptive-only', 'welch'],
      biologicalUnits: ['subject', 'acquisition'],
      eyeAggregations: ['average-eyes', 'right-eye', 'left-eye'],
      comparisonDesigns: ['independent', 'paired'],
    }
  }

  function sampleMatchesPlan(sample, plan) {
    if (!sample) return false
    if (plan.sourceType !== 'All' && sourceTypeFromMode(sample.mode) !== plan.sourceType) return false
    if (plan.protocolMode !== 'All' && String(sample.mode || '') !== plan.protocolMode) return false
    if (
      plan.protocolFamily !== 'All' &&
      normalizeText(parseCondition(sample.condition).protocolFamily) !== plan.protocolFamily
    ) {
      return false
    }
    if (plan.condition !== 'All' && String(sample.condition || '') !== plan.condition) return false
    return true
  }

  function metricRow(sample, plan) {
    const analysisSample = sampleForEyeAggregation(sample, plan.eyeAggregation)
    const raw =
      plan.eyeAggregation === 'average-eyes'
        ? (sample.metrics && sample.metrics.raw) || metrics.deriveRawMetrics(sample)
        : metrics.deriveRawMetrics(analysisSample)
    const correctionContext = { ...analysisSample.corrections, mode: sample.mode }
    const manual = metrics.deriveManualMetrics(raw, correctionContext)
    const corrected = metrics.correctedMetrics(raw, correctionContext)
    const values =
      plan.metricVersion === 'manual' ? manual : plan.metricVersion === 'corrected' ? corrected : raw
    const value = displayMetricValue(values && values[plan.metricKey], plan.metricKey)
    const condition = sample.condition || ''
    const conditionMeta = parseCondition(condition)
    return {
      sampleId: sample.id || '',
      subjectId: sample.subjectId || '',
      acquisitionId: sample.acquisitionId || '',
      pairedId: sample.pairedId || sample.subjectId || '',
      sample: sample.label || '',
      cohort: sample.cohort || 'Unassigned',
      included: sample.included !== false && analysisEyeIncluded(sample, plan.eyeAggregation),
      sourceType: sourceTypeFromMode(sample.mode),
      mode: sample.mode || '',
      condition,
      conditionShort: conditionMeta.shortLabel,
      protocolFamily: sourceTypeFromMode(sample.mode) === 'FVEP' ? 'FVEP' : conditionMeta.protocolFamily,
      protocolIndex: conditionMeta.protocolIndex,
      adaptation: conditionMeta.adaptation,
      stimulusValue: conditionMeta.stimulusValue,
      stimulusUnit: conditionMeta.stimulusUnit,
      stimulusDurationMs: conditionMeta.durationMs,
      sourceName: sample.sourceName || '',
      metric: plan.metricKey,
      unit: protocols.metricUnit(plan.metricKey) || '',
      version: plan.metricVersion,
      source: metricSource(plan.metricVersion, manual, plan.metricKey),
      biologicalUnit: plan.biologicalUnit,
      eyeAggregation: plan.eyeAggregation,
      comparisonDesign: plan.comparisonDesign,
      value: Number.isFinite(value) ? value : null,
      qcWarnings: Array.isArray(sample.qc)
        ? sample.qc.filter((item) => item && item.level === 'warn').map((item) => item.message || '')
        : [],
    }
  }

  function metricSource(version, manual, metricKey) {
    if (version === 'raw') return 'raw'
    return Object.prototype.hasOwnProperty.call(manual || {}, metricKey) ? 'manual' : 'raw-fallback'
  }

  function sampleForEyeAggregation(sample, eyeAggregation) {
    if (eyeAggregation === 'average-eyes') return sampleWithIncludedEyes(sample)
    const side = eyeAggregation === 'left-eye' ? 'left' : 'right'
    const emptySide = side === 'left' ? 'right' : 'left'
    const traces = sample && sample.traces ? sample.traces : {}
    const marks = sample && sample.machineMarks ? sample.machineMarks : {}
    const manual = sample && sample.corrections && sample.corrections.manualPoints
    return {
      ...sample,
      traces: {
        right: side === 'right' ? traces.right : { x: [], y: [] },
        left: side === 'left' ? traces.left : { x: [], y: [] },
      },
      machineMarks: {
        right: side === 'right' ? marks.right || '' : '',
        left: side === 'left' ? marks.left || '' : '',
      },
      corrections: {
        ...(sample.corrections || {}),
        manualPoints: {
          right: side === 'right' && manual && manual.right ? manual.right : {},
          left: side === 'left' && manual && manual.left ? manual.left : {},
        },
      },
      metadata: {
        ...(sample.metadata || {}),
        analysisEye: side,
        ignoredEye: emptySide,
      },
    }
  }

  function sampleWithIncludedEyes(sample) {
    const traces = sample && sample.traces ? sample.traces : {}
    const marks = sample && sample.machineMarks ? sample.machineMarks : {}
    const manual = sample && sample.corrections && sample.corrections.manualPoints
    const rightIncluded = analysisEyeIncluded(sample, 'right-eye')
    const leftIncluded = analysisEyeIncluded(sample, 'left-eye')
    return {
      ...sample,
      traces: {
        right: rightIncluded ? traces.right : { x: [], y: [] },
        left: leftIncluded ? traces.left : { x: [], y: [] },
      },
      machineMarks: {
        right: rightIncluded ? marks.right || '' : '',
        left: leftIncluded ? marks.left || '' : '',
      },
      corrections: {
        ...(sample.corrections || {}),
        manualPoints: {
          right: rightIncluded && manual && manual.right ? manual.right : {},
          left: leftIncluded && manual && manual.left ? manual.left : {},
        },
      },
    }
  }

  function analysisEyeIncluded(sample, eyeAggregation) {
    if (!sample || sample.included === false) return false
    const excludedEyes = sample.corrections && sample.corrections.excludedEyes ? sample.corrections.excludedEyes : {}
    if (eyeAggregation === 'right-eye') return excludedEyes.right !== true
    if (eyeAggregation === 'left-eye') return excludedEyes.left !== true
    return excludedEyes.right !== true || excludedEyes.left !== true
  }

  function displayMetricValue(value, metricKey) {
    const number = Number(value)
    if (!Number.isFinite(number)) return NaN
    return metricKey === 'aAmplitudeUv' ? Math.abs(number) : number
  }

  function summarizeRows(rows, keys) {
    const buckets = new Map()
    ;(rows || []).forEach((row) => {
      const value = Number(row.value)
      if (!Number.isFinite(value)) return
      const key = keys.map((field) => row[field] || 'Unassigned').join('||')
      if (!buckets.has(key)) {
        buckets.set(key, {
          ...Object.fromEntries(keys.map((field) => [field, row[field] || 'Unassigned'])),
          ...(keys.includes('condition') ? conditionFields(row) : {}),
          values: [],
        })
      }
      buckets.get(key).values.push(value)
    })
    return Array.from(buckets.values())
      .map((bucket) => {
        const values = bucket.values
        const row = {
          ...bucket,
          n: values.length,
          mean: round(mean(values), 4),
          sd: round(sd(values), 4),
          sem: round(sem(values), 4),
          min: round(Math.min(...values), 4),
          max: round(Math.max(...values), 4),
        }
        delete row.values
        return row
      })
      .sort((left, right) =>
        keys
          .map((field) => String(left[field] || ''))
          .join(' ')
          .localeCompare(keys.map((field) => String(right[field] || '')).join(' '))
      )
  }

  function buildWarnings(sourceRows, finiteRows, analysisRows, conditionSummary, plan, pairedReadiness) {
    const warnings = []
    if (!sourceRows.length) {
      warnings.push(
        warning('no-records', 'No acquisition records match the current analysis scope.', 'error')
      )
    }
    if (sourceRows.length && !finiteRows.length) {
      warnings.push(warning('no-valid-values', `No finite ${plan.metricKey} values are available.`, 'error'))
    }
    if (finiteRows.length && !analysisRows.length) {
      warnings.push(warning('no-included-records', 'All finite records in this scope are excluded.', 'error'))
    }
    const conditions = unique(analysisRows.map((row) => row.condition))
    if (plan.condition === 'All' && conditions.length > 1) {
      warnings.push(
        warning(
          'condition-pooling-blocked',
          'Multiple stimuli are present; pooled inferential statistics are blocked.',
          'warn'
        )
      )
    }
    if (analysisRows.some((row) => row.qcWarnings.length)) {
      warnings.push(warning('qc-included', 'Included records contain QC warnings.', 'warn'))
    }
    if (plan.metricVersion === 'manual' && analysisRows.some((row) => row.source === 'raw-fallback')) {
      warnings.push(warning('manual-missing-pick', 'Manual analysis includes raw-fallback values where manual points are absent.', 'warn'))
    }
    if (plan.comparisonDesign === 'paired') {
      warnings.push(
        warning(
          'paired-design-descriptive',
          'Paired/repeated-measures design is recorded; inferential paired tests are not yet enabled.',
          'warn'
        )
      )
      warnings.push(...pairedReadinessWarnings(pairedReadiness))
    }
    if (conditionSummary.some((row) => row.n < 2)) {
      warnings.push(warning('small-condition-n', 'At least one stimulus/group cell has n < 2.', 'warn'))
    }
    return warnings
  }

  function pairedReadinessWarnings(rows) {
    const warnings = []
    const readinessRows = Array.isArray(rows) ? rows : []
    const byIssue = groupBy(readinessRows, (row) => row.issue || 'paired-id-readiness')
    byIssue.forEach((issueRows, issue) => {
      const severity = issueRows.some((row) => row.level === 'error') ? 'error' : 'warn'
      warnings.push(warning(issue, pairedReadinessMessage(issue, issueRows), severity))
    })
    return warnings
  }

  function pairedReadinessMessage(issue, rows) {
    const count = rows.length
    const suffix = count === 1 ? '' : 's'
    if (issue === 'paired-id-missing')
      return `${count} included paired-design record${suffix} lack a paired ID.`
    if (issue === 'paired-id-cohort-count') {
      return `${count} stimulus${suffix} do not have exactly two paired groups.`
    }
    if (issue === 'paired-id-duplicate') {
      return `${count} pair ID${suffix} are duplicated within the same group.`
    }
    if (issue === 'paired-id-incomplete') {
      return `${count} pair ID${suffix} are missing a counterpart.`
    }
    return `${count} paired-ID readiness issue${suffix}.`
  }

  function buildPairedReadiness(rows) {
    const details = []
    const analysisRows = Array.isArray(rows) ? rows : []
    const missingRows = analysisRows.filter((row) => !String(row.pairedId || '').trim())
    missingRows.forEach((row) =>
      details.push(
        pairedReadinessRow({
          issue: 'paired-id-missing',
          level: 'warn',
          condition: row.condition || 'All',
          cohort: row.cohort || 'Unassigned',
          pairedId: '',
          sampleIds: [row.sampleId],
          message: 'Included paired-design record lacks a paired ID.',
        })
      )
    )

    const rowsByCondition = groupBy(
      analysisRows.filter((row) => String(row.pairedId || '').trim()),
      (row) => row.condition || 'All'
    )
    rowsByCondition.forEach((conditionRows, condition) => {
      const cohorts = unique(conditionRows.map((row) => row.cohort || 'Unassigned'))
      if (cohorts.length && cohorts.length !== 2) {
        details.push(
          pairedReadinessRow({
            issue: 'paired-id-cohort-count',
            level: 'warn',
            condition,
            cohort: cohorts.join(', '),
            pairedId: '',
            sampleIds: conditionRows.map((row) => row.sampleId),
            message: `Paired design expects two groups; found ${cohorts.length}.`,
          })
        )
      }

      const duplicateKeys = new Map()
      conditionRows.forEach((row) => {
        const key = [row.cohort || 'Unassigned', row.pairedId].join('||')
        const existing = duplicateKeys.get(key) || []
        existing.push(row)
        duplicateKeys.set(key, existing)
      })
      Array.from(duplicateKeys.entries())
        .filter((entry) => entry[1].length > 1)
        .forEach(([key, duplicateRows]) => {
          const [cohort, pairedId] = key.split('||')
          details.push(
            pairedReadinessRow({
              issue: 'paired-id-duplicate',
              level: 'warn',
              condition,
              cohort,
              pairedId,
              sampleIds: duplicateRows.map((row) => row.sampleId),
              message: 'Pair ID appears more than once within the same group.',
            })
          )
        })

      if (cohorts.length === 2) {
        const cohortPairIds = cohorts.map(
          (cohort) =>
            new Set(
              conditionRows
                .filter((row) => (row.cohort || 'Unassigned') === cohort)
                .map((row) => row.pairedId)
                .filter(Boolean)
            )
        )
        const allPairIds = unique(conditionRows.map((row) => row.pairedId))
        allPairIds
          .filter((pairedId) => cohortPairIds.some((pairIds) => !pairIds.has(pairedId)))
          .forEach((pairedId) => {
            const presentCohorts = cohorts.filter((cohort) =>
              conditionRows.some(
                (row) => (row.cohort || 'Unassigned') === cohort && row.pairedId === pairedId
              )
            )
            const missingCohorts = cohorts.filter((cohort) => !presentCohorts.includes(cohort))
            details.push(
              pairedReadinessRow({
                issue: 'paired-id-incomplete',
                level: 'warn',
                condition,
                cohort: presentCohorts.join(', '),
                pairedId,
                sampleIds: conditionRows
                  .filter((row) => row.pairedId === pairedId)
                  .map((row) => row.sampleId),
                message: `Pair ID is missing counterpart in group ${missingCohorts.join(', ')}.`,
              })
            )
          })
      }
    })
    return details
  }

  function pairedReadinessRow({ issue, level, condition, cohort, pairedId, sampleIds, message }) {
    return {
      issue: issue || '',
      level: level || 'warn',
      condition: condition || '',
      cohort: cohort || '',
      pairedId: pairedId || '',
      sampleIds: (sampleIds || []).filter(Boolean),
      message: message || '',
    }
  }

  function groupBy(rows, getKey) {
    const buckets = new Map()
    ;(rows || []).forEach((row) => {
      const key = getKey(row)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(row)
    })
    return buckets
  }

  function buildStats(analysisRows, conditionSummary, plan, warnings) {
    const conditionPoolingBlocked = warnings.some((item) => item.code === 'condition-pooling-blocked')
    if (conditionPoolingBlocked) {
      return blockedStats('condition-pooling', 'Stimulus-stratified descriptive summary only.')
    }
    if (plan.statsPolicy === 'descriptive-only') {
      return blockedStats('descriptive-only', 'Descriptive statistics requested.')
    }
    if (plan.comparisonDesign === 'paired') {
      return blockedStats(
        'paired-design',
        'Paired/repeated-measures design is descriptive-only in this build.'
      )
    }
    const cohorts = unique(analysisRows.map((row) => row.cohort))
    if (cohorts.length !== 2) {
      return blockedStats('cohort-count', 'Welch test requires exactly two groups.')
    }
    const cohortRows = cohorts.map((cohort) => analysisRows.filter((row) => row.cohort === cohort))
    if (cohortRows.some((rows) => rows.length < 2)) {
      return blockedStats('insufficient-n', 'Welch test requires n >= 2 in each group.')
    }
    const groups = cohortRows.map((rows, index) => ({
      cohort: cohorts[index],
      values: rows.map((row) => Number(row.value)).filter(Number.isFinite),
    }))
    const test = welch(groups[0], groups[1])
    if (!Number.isFinite(test.tStatistic)) {
      return blockedStats('zero-variance', 'Welch test is undefined for these values.')
    }
    return {
      status: 'ok',
      test: 'Welch t-test',
      blockedBy: '',
      message: `${groups[0].cohort} vs ${groups[1].cohort}`,
      cohorts,
      meanDiff: round(test.meanDiff, 4),
      tStatistic: round(test.tStatistic, 4),
      df: round(test.df, 4),
      pValue: round(test.pValue, 6),
      effectSize: round(test.effectSize, 4),
      assumptions: [
        plan.biologicalUnit === 'subject' ? 'subject is the biological unit' : 'acquisition is the unit',
        eyeAggregationLabel(plan.eyeAggregation),
        'two independent groups',
        'finite metric values',
        'stimulus pooling not allowed',
      ],
    }
  }

  function buildFigureSeries(analysisRows, conditionSummary, plan, stats) {
    if (stats.blockedBy === 'condition-pooling') {
      return conditionSummary.map((row) => ({
        type: 'condition-summary',
        cohort: row.cohort,
        condition: row.condition,
        conditionShort: row.conditionShort,
        protocolFamily: row.protocolFamily,
        protocolIndex: row.protocolIndex,
        adaptation: row.adaptation,
        stimulusValue: row.stimulusValue,
        stimulusUnit: row.stimulusUnit,
        stimulusDurationMs: row.stimulusDurationMs,
        n: row.n,
        mean: row.mean,
        sem: row.sem,
      }))
    }
    return unique(analysisRows.map((row) => row.cohort)).map((cohort) => ({
      type: 'individual-values',
      cohort,
      points: analysisRows
        .filter((row) => row.cohort === cohort)
        .map((row) => ({
          sampleId: row.sampleId,
          subjectId: row.subjectId,
          condition: row.condition,
          conditionShort: row.conditionShort,
          protocolFamily: row.protocolFamily,
          protocolIndex: row.protocolIndex,
          adaptation: row.adaptation,
          stimulusValue: row.stimulusValue,
          stimulusUnit: row.stimulusUnit,
          stimulusDurationMs: row.stimulusDurationMs,
          value: row.value,
          metric: plan.metricKey,
          version: plan.metricVersion,
        })),
    }))
  }

  function buildPublicationPanels(samples, plan) {
    const endpointRows = buildEndpointRows(samples, plan)
    const sourceType = plan.sourceType === 'All' ? '' : plan.sourceType
    if ((sourceType || endpointRows[0]?.sourceType) === 'FVEP') return buildFvepPanels(endpointRows, plan)
    return buildErgPanels(endpointRows, plan)
  }

  function buildEndpointRows(samples, plan) {
    const rows = []
    ;(samples || [])
      .filter((sample) => sampleMatchesPlan(sample, plan))
      .forEach((sample) => {
        const analysisSample = sampleForEyeAggregation(sample, plan.eyeAggregation)
        const raw =
          plan.eyeAggregation === 'average-eyes'
            ? (sample.metrics && sample.metrics.raw) || metrics.deriveRawMetrics(sample)
            : metrics.deriveRawMetrics(analysisSample)
        const correctionContext = { ...analysisSample.corrections, mode: sample.mode }
        const manual = metrics.deriveManualMetrics(raw, correctionContext)
        const corrected = metrics.correctedMetrics(raw, correctionContext)
        const values =
          plan.metricVersion === 'manual' ? manual : plan.metricVersion === 'corrected' ? corrected : raw
        const conditionMeta = parseCondition(sample.condition)
        protocols
          .metricOptionsForPlan(protocols.metricKeys(), {
            sourceType: sourceTypeFromMode(sample.mode),
            protocolMode: sample.mode,
          })
          .filter((metricKey) => metricKey !== 'amplitudeUv')
          .forEach((metricKey) => {
            const value = Number(values && values[metricKey])
            if (!Number.isFinite(value)) return
            rows.push({
              sampleId: sample.id || '',
              subjectId: sample.subjectId || '',
              acquisitionId: sample.acquisitionId || '',
              cohort: sample.cohort || 'Unassigned',
              included: sample.included !== false,
              sourceType: sourceTypeFromMode(sample.mode),
              mode: sample.mode || '',
              condition: sample.condition || '',
              conditionShort: conditionMeta.shortLabel,
              protocolFamily: conditionMeta.protocolFamily || sample.mode || '',
              protocolIndex: conditionMeta.protocolIndex,
              adaptation: conditionMeta.adaptation,
              stimulusValue: conditionMeta.stimulusValue,
              stimulusUnit: conditionMeta.stimulusUnit,
              stimulusDurationMs: conditionMeta.durationMs,
              metricKey,
              metricLabel: protocols.metricLabel(metricKey),
              unit: protocols.metricUnit(metricKey),
              value,
              layer: plan.metricVersion,
              source: plan.metricVersion === 'raw' ? 'raw' : Object.prototype.hasOwnProperty.call(manual, metricKey) ? 'manual' : 'raw-fallback',
            })
          })
      })
    return rows.filter((row) => row.included !== false)
  }

  function buildErgPanels(endpointRows) {
    const panels = []
    ;[
      ['aAmplitudeUv', 'a-wave amp response'],
      ['bAmplitudeUv', 'b-wave amp response'],
      ['aLatencyMs', 'a-wave implicit-time panel'],
      ['bLatencyMs', 'b-wave implicit-time panel'],
    ].forEach(([metricKey, baseTitle]) => {
      splitRowsByFamily(endpointRows.filter((row) => row.metricKey === metricKey && row.mode === 'FERG')).forEach(
        ([family, rows]) => {
          panels.push(panelFromRows(rows, {
            id: `erg-${slug(family)}-${metricKey}`,
            title: `${family || 'FERG'} ${baseTitle}`,
            metricKey,
            kind: hasMultipleConditions(rows) ? 'response-curve' : 'group-summary',
            scientificRole:
              metricKey === 'aAmplitudeUv' || metricKey === 'aLatencyMs'
                ? 'Photoreceptor-dominant ERG endpoint.'
                : 'Post-receptoral bipolar/Muller-cell ERG endpoint.',
          }))
        }
      )
    })
    const opRows = endpointRows.filter((row) => row.mode === 'dOps')
    ;['sumOpAmplitudeUv', 'op1AmplitudeUv', 'op2AmplitudeUv', 'op3AmplitudeUv', 'op4AmplitudeUv', 'op5AmplitudeUv'].forEach(
      (metricKey) => {
        const rows = opRows.filter((row) => row.metricKey === metricKey)
        if (rows.length) {
          panels.push(panelFromRows(rows, {
            id: `erg-dops-${metricKey}`,
            title: metricKey === 'sumOpAmplitudeUv' ? 'OP/dOps summed amp' : `dOps ${protocols.metricBaseLabel(metricKey)}`,
            metricKey,
            kind: hasMultipleConditions(rows) ? 'response-curve' : 'group-summary',
            scientificRole: 'Oscillatory-potential peak-to-valley endpoint with manual-pick provenance.',
          }))
        }
      }
    )
    ;['flickerAmplitudeUv', 'flickerImplicitTimeMs', 'flickerPhaseDeg', 'flickerWaveformAmplitudeUv', 'flickerWaveformPhaseDeg'].forEach(
      (metricKey) => {
        const rows = endpointRows.filter((row) => row.mode === 'Flicker' && row.metricKey === metricKey)
        if (rows.length) {
          panels.push(panelFromRows(rows, {
            id: `erg-flicker-${metricKey}`,
            title: flickerPanelTitle(metricKey),
            metricKey,
            kind: hasMultipleConditions(rows) ? 'frequency-or-stimulus-response' : 'group-summary',
            scientificRole: 'Light-adapted temporal response endpoint; phase is interpreted separately from amp.',
          }))
        }
      }
    )
    return panels.filter(Boolean)
  }

  function buildFvepPanels(endpointRows) {
    return [
      ['p1n1AmplitudeUv', 'FVEP P1-N1 amp summary'],
      ['p1n2AmplitudeUv', 'FVEP P1-N2 amp summary'],
      ['p2n2AmplitudeUv', 'FVEP P2-N2 amp summary'],
      ['n1LatencyMs', 'FVEP N1 latency summary'],
      ['p1LatencyMs', 'FVEP P1 latency summary'],
      ['n2LatencyMs', 'FVEP N2 latency summary'],
      ['p2LatencyMs', 'FVEP P2 latency summary'],
    ]
      .map(([metricKey, title]) => {
        const rows = endpointRows.filter((row) => row.sourceType === 'FVEP' && row.metricKey === metricKey)
        return rows.length
          ? panelFromRows(rows, {
              id: `fvep-${metricKey}`,
              title,
              metricKey,
              kind: hasMultipleConditions(rows) ? 'stimulus-response' : 'group-summary',
              scientificRole: metricKey.includes('Amplitude')
                ? 'Visual pathway peak-to-peak response strength.'
                : 'Visual pathway response timing endpoint.',
            })
          : null
      })
      .filter(Boolean)
  }

  function panelFromRows(rows, definition) {
    const summaryRows = summarizePanelRows(rows)
    const unit = protocols.metricUnit(definition.metricKey)
    const stimulusUnit = panelStimulusUnit(summaryRows)
    return {
      id: definition.id,
      title: definition.title,
      kind: definition.kind,
      metricKey: definition.metricKey,
      metricLabel: protocols.metricLabel(definition.metricKey),
      unit,
      xAxisLabel: stimulusUnit ? `Stimulus (${stimulusUnit})` : hasMultipleConditions(rows) ? 'Stimulus' : 'Group',
      yAxisLabel: axisLabelForMetric(definition.metricKey),
      scientificRole: definition.scientificRole || '',
      status: summaryRows.length ? 'ready' : 'blocked',
      detail: summaryRows.length
        ? `${summaryRows.length} stimulus/group summar${summaryRows.length === 1 ? 'y' : 'ies'}`
        : 'No finite included endpoint values.',
      sourceRows: rows,
      summaryRows,
    }
  }

  function summarizePanelRows(rows) {
    const buckets = new Map()
    ;(rows || []).forEach((row) => {
      const key = [row.condition || 'All', row.cohort || 'Unassigned'].join('||')
      if (!buckets.has(key)) {
        buckets.set(key, {
          cohort: row.cohort || 'Unassigned',
          condition: row.condition || 'All',
          conditionShort: row.conditionShort || '',
          protocolFamily: row.protocolFamily || '',
          protocolIndex: row.protocolIndex,
          adaptation: row.adaptation,
          stimulusValue: row.stimulusValue,
          stimulusUnit: row.stimulusUnit,
          stimulusDurationMs: row.stimulusDurationMs,
          values: [],
        })
      }
      buckets.get(key).values.push(Number(row.value))
    })
    return Array.from(buckets.values())
      .map((bucket) => {
        const values = bucket.values.filter(Number.isFinite)
        const row = {
          ...bucket,
          n: values.length,
          mean: round(mean(values), 4),
          sd: round(sd(values), 4),
          sem: round(sem(values), 4),
          min: values.length ? round(Math.min(...values), 4) : null,
          max: values.length ? round(Math.max(...values), 4) : null,
        }
        delete row.values
        return row
      })
      .filter((row) => row.n)
      .sort((left, right) => conditionRowSort(left, right) || String(left.cohort).localeCompare(String(right.cohort)))
  }

  function splitRowsByFamily(rows) {
    const families = new Map()
    ;(rows || []).forEach((row) => {
      const family = row.protocolFamily || 'FERG'
      if (!families.has(family)) families.set(family, [])
      families.get(family).push(row)
    })
    return Array.from(families.entries()).sort((left, right) => String(left[0]).localeCompare(String(right[0])))
  }

  function hasMultipleConditions(rows) {
    return unique((rows || []).map((row) => row.condition)).length > 1
  }

  function panelStimulusUnit(rows) {
    const units = unique((rows || []).map((row) => row.stimulusUnit))
    const values = (rows || []).map((row) => Number(row.stimulusValue)).filter(Number.isFinite)
    return units.length === 1 && values.length ? units[0] : ''
  }

  function conditionRowSort(left, right) {
    if (Number.isFinite(Number(left.protocolIndex)) && Number.isFinite(Number(right.protocolIndex))) {
      return Number(left.protocolIndex) - Number(right.protocolIndex)
    }
    if (Number.isFinite(Number(left.stimulusValue)) && Number.isFinite(Number(right.stimulusValue))) {
      return Number(left.stimulusValue) - Number(right.stimulusValue)
    }
    return String(left.condition || '').localeCompare(String(right.condition || ''))
  }

  function slug(value) {
    return String(value || 'all')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function flickerPanelTitle(metricKey) {
    if (metricKey === 'flickerAmplitudeUv') return 'Flicker amp summary'
    if (metricKey === 'flickerPhaseDeg') return 'Flicker phase summary'
    if (metricKey === 'flickerImplicitTimeMs') return 'Flicker implicit-time summary'
    if (metricKey === 'flickerWaveformAmplitudeUv') return 'Flicker Fourier amp summary'
    if (metricKey === 'flickerWaveformPhaseDeg') return 'Flicker Fourier phase summary'
    return protocols.metricBaseLabel(metricKey)
  }

  function axisLabelForMetric(metricKey) {
    if (metricKey === 'aAmplitudeUv') return 'A-wave amp (µV)'
    if (metricKey === 'bAmplitudeUv') return 'B-wave amp (µV)'
    return protocols.metricLabel(metricKey)
  }

  function buildWaveformSummary(samples, analysisRows, plan) {
    const sourceType = plan.sourceType === 'All' ? sourceTypeFromMode(plan.protocolMode) : plan.sourceType
    const isFvep = sourceType === 'FVEP' || String(plan.protocolMode || '').toLowerCase() === 'fvep'
    const conditions = unique(analysisRows.map((row) => row.condition))
    if (!isFvep)
      return {
        status: 'not-applicable',
        message: '',
        series: [],
      }
    if (!analysisRows.length)
      return { status: 'empty', message: 'No included FVEP records are available.', series: [] }
    if (conditions.length !== 1) {
      return {
        status: 'condition-required',
        message: 'Select one FVEP stimulus to average waveforms.',
        series: [],
      }
    }
    const includedIds = new Set(analysisRows.map((row) => row.sampleId))
    const sampleMap = new Map(samples.map((sample) => [sample.id, sample]))
    const byCohort = new Map()
    includedIds.forEach((sampleId) => {
      const sample = sampleMap.get(sampleId)
      if (!sample) return
      const trace = sampleAverageTrace(sample)
      if (!trace || !trace.y.length) return
      const cohort = sample.cohort || 'Unassigned'
      if (!byCohort.has(cohort)) byCohort.set(cohort, [])
      byCohort.get(cohort).push({ sampleId, subjectId: sample.subjectId || '', trace })
    })
    const series = Array.from(byCohort.entries())
      .map(([cohort, traces]) => averageTraceSeries(cohort, traces))
      .filter((seriesRow) => seriesRow && seriesRow.n)
      .sort((left, right) => left.cohort.localeCompare(right.cohort))
    return {
      status: series.length ? 'ok' : 'empty',
      condition: conditions[0],
      message: series.length ? 'Group average waveform with SEM.' : 'No trace arrays are available.',
      series,
    }
  }

  function sampleAverageTrace(sample) {
    const traces = ['right', 'left']
      .map((side) => sample && sample.traces && sample.traces[side])
      .filter((trace) => trace && Array.isArray(trace.x) && Array.isArray(trace.y) && trace.y.length)
    if (!traces.length) return null
    const minLength = Math.min(...traces.map((trace) => trace.y.length))
    if (!minLength) return null
    const x = traces[0].x.slice(0, minLength).map(Number)
    const y = Array.from({ length: minLength }, (_item, index) => {
      const values = traces.map((trace) => Number(trace.y[index])).filter(Number.isFinite)
      return round(mean(values), 4)
    })
    return { x, y }
  }

  function averageTraceSeries(cohort, entries) {
    const traces = entries.map((entry) => entry.trace).filter((trace) => trace && trace.y.length)
    if (!traces.length) return null
    const minLength = Math.min(...traces.map((trace) => trace.y.length))
    const x = traces[0].x.slice(0, minLength).map((value) => round(value, 4))
    const meanY = []
    const semY = []
    for (let index = 0; index < minLength; index += 1) {
      const values = traces.map((trace) => Number(trace.y[index])).filter(Number.isFinite)
      meanY.push(round(mean(values), 4))
      semY.push(round(sem(values), 4))
    }
    return {
      cohort,
      n: traces.length,
      subjects: entries.map((entry) => entry.subjectId).filter(Boolean),
      x,
      meanY,
      semY,
    }
  }

  function buildSnapshot(sourceRows, analysisRows, plan) {
    const values = analysisRows.map((row) => Number(row.value)).filter(Number.isFinite)
    return {
      metric: plan.metricKey,
      layer: plan.metricVersion,
      usable: `${analysisRows.length}/${sourceRows.length}`,
      mean: round(mean(values), 4),
      range: values.length ? `${round(Math.min(...values), 2)}-${round(Math.max(...values), 2)}` : 'NA',
      conditions: unique(analysisRows.map((row) => row.condition)).length,
      biologicalUnit: plan.biologicalUnit,
      eyeAggregation: plan.eyeAggregation,
      comparisonDesign: plan.comparisonDesign,
    }
  }

  function welch(left, right) {
    const leftMean = mean(left.values)
    const rightMean = mean(right.values)
    const leftVariance = variance(left.values)
    const rightVariance = variance(right.values)
    const leftTerm = leftVariance / left.values.length
    const rightTerm = rightVariance / right.values.length
    const denominator = Math.sqrt(leftTerm + rightTerm)
    const tStatistic = denominator ? (leftMean - rightMean) / denominator : NaN
    const df =
      (leftTerm + rightTerm) ** 2 /
      (leftTerm ** 2 / (left.values.length - 1) + rightTerm ** 2 / (right.values.length - 1))
    const pooledSd = Math.sqrt(
      ((left.values.length - 1) * leftVariance + (right.values.length - 1) * rightVariance) /
        (left.values.length + right.values.length - 2)
    )
    const effectSize = pooledSd ? (leftMean - rightMean) / pooledSd : NaN
    return {
      meanDiff: leftMean - rightMean,
      tStatistic,
      df,
      pValue: Number.isFinite(tStatistic) && Number.isFinite(df) ? studentTPValue(tStatistic, df) : NaN,
      effectSize,
    }
  }

  function studentTPValue(tStatistic, df) {
    const t = Math.abs(tStatistic)
    const x = df / (df + t * t)
    const tail = 0.5 * regularizedBeta(x, df / 2, 0.5)
    return Math.max(0, Math.min(1, 2 * tail))
  }

  function regularizedBeta(x, a, b) {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
    if (x < (a + 1) / (a + b + 2)) return (bt * betaFraction(x, a, b)) / a
    return 1 - (bt * betaFraction(1 - x, b, a)) / b
  }

  function betaFraction(x, a, b) {
    const maxIterations = 100
    const epsilon = 3e-7
    const fpMin = 1e-30
    let c = 1
    let d = 1 - ((a + b) * x) / (a + 1)
    if (Math.abs(d) < fpMin) d = fpMin
    d = 1 / d
    let h = d
    for (let m = 1; m <= maxIterations; m += 1) {
      const m2 = 2 * m
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
      d = 1 + aa * d
      if (Math.abs(d) < fpMin) d = fpMin
      c = 1 + aa / c
      if (Math.abs(c) < fpMin) c = fpMin
      d = 1 / d
      h *= d * c
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
      d = 1 + aa * d
      if (Math.abs(d) < fpMin) d = fpMin
      c = 1 + aa / c
      if (Math.abs(c) < fpMin) c = fpMin
      d = 1 / d
      const delta = d * c
      h *= delta
      if (Math.abs(delta - 1) < epsilon) break
    }
    return h
  }

  function logGamma(value) {
    const coefficients = [
      676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905,
      -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
    ]
    if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value)
    let x = 0.9999999999998099
    const shifted = value - 1
    coefficients.forEach((coefficient, index) => {
      x += coefficient / (shifted + index + 1)
    })
    const t = shifted + coefficients.length - 0.5
    return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x)
  }

  function blockedStats(reason, message) {
    return {
      status: 'blocked',
      test: 'descriptive',
      blockedBy: reason,
      message,
      cohorts: [],
      meanDiff: null,
      tStatistic: null,
      df: null,
      pValue: null,
      effectSize: null,
      assumptions: [],
    }
  }

  function eyeAggregationLabel(value) {
    if (value === 'right-eye') return 'right eye only'
    if (value === 'left-eye') return 'left eye only'
    return 'right and left eyes averaged before statistics'
  }

  function sourceTypeFromMode(mode) {
    return String(mode || '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
  }

  function parseCondition(condition) {
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
    const adaptation = stimulusMatch && stimulusMatch[1] ? stimulusMatch[1] : ''
    const shortLabel = makeConditionShortLabel({
      protocolFamily,
      stimulusValue,
      stimulusUnit,
      durationMs,
      adaptation,
      fallback: protocol || text,
    })
    return {
      protocolIndex: protocolMatch ? Number(protocolMatch[2]) : null,
      protocolFamily,
      adaptation,
      stimulusValue: Number.isFinite(stimulusValue) ? stimulusValue : null,
      stimulusUnit,
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      shortLabel,
    }
  }

  function conditionFields(row) {
    return {
      conditionShort: row.conditionShort || '',
      protocolFamily: row.protocolFamily || '',
      protocolIndex: row.protocolIndex,
      adaptation: row.adaptation || '',
      stimulusValue: row.stimulusValue,
      stimulusUnit: row.stimulusUnit || '',
      stimulusDurationMs: row.stimulusDurationMs,
    }
  }

  function makeConditionShortLabel(meta) {
    if (meta.stimulusValue != null && Number.isFinite(Number(meta.stimulusValue))) {
      const family = meta.protocolFamily || 'Stimulus'
      const value = formatCompactNumber(meta.stimulusValue)
      return `${family} ${value}`.trim()
    }
    return String(meta.fallback || 'Stimulus').trim()
  }

  function normalizeStimulusUnit(unit) {
    return String(unit || '')
      .replace(/\s+/g, '')
      .replace('cd.m-2', 'cd/m2')
  }

  function formatCompactNumber(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return ''
    return Number.isInteger(number) ? String(number) : String(round(number, 3))
  }

  function scopeLabel(plan) {
    return [
      plan.sourceType === 'All' ? '' : plan.sourceType,
      plan.protocolMode === 'All' ? '' : plan.protocolMode,
      plan.protocolFamily === 'All' ? '' : plan.protocolFamily,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  function warning(code, message, level) {
    return { code, message, level: level || 'warn' }
  }

  function normalizeChoice(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback
  }

  function normalizeMetricVersion(value) {
    const text = String(value || '').toLowerCase()
    if (text === 'manual' || text === 'corrected') return 'manual'
    return 'raw'
  }

  function normalizeText(value) {
    const text = String(value || '').trim()
    return text || 'All'
  }

  function unique(values) {
    return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)))
  }

  function optionSort(left, right) {
    if (left === 'All') return -1
    if (right === 'All') return 1
    return String(left).localeCompare(String(right))
  }

  function mean(values) {
    const clean = values.map(Number).filter(Number.isFinite)
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null
  }

  function variance(values) {
    const clean = values.map(Number).filter(Number.isFinite)
    if (clean.length < 2) return NaN
    const average = mean(clean)
    return clean.reduce((sum, value) => sum + (value - average) ** 2, 0) / (clean.length - 1)
  }

  function sd(values) {
    const value = variance(values)
    return Number.isFinite(value) ? Math.sqrt(value) : null
  }

  function sem(values) {
    const standardDeviation = sd(values)
    return Number.isFinite(standardDeviation) ? standardDeviation / Math.sqrt(values.length) : null
  }

  function round(value, digits) {
    if (!Number.isFinite(Number(value))) return null
    const factor = 10 ** Number(digits || 0)
    return Math.round(Number(value) * factor) / factor
  }

  return {
    buildAnalysisPlan,
    availableAnalysisOptions,
    runAnalysis,
    validateAnalysisPlan,
    sourceTypeFromMode,
    parseCondition,
    summarizeRows,
    welch,
  }
})
