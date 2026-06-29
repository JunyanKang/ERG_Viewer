;(function initProject(root, factory) {
  const api = factory(root.ERGv2Metrics || (typeof require === 'function' ? require('./metrics') : null))
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2Project = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory(metrics) {
  function createEmptyProject() {
    return {
      schema: 'erg-viewer-v2-project',
      version: 1,
      title: 'Untitled ERG project',
      createdAt: new Date().toISOString(),
      savedAt: '',
      projectFilePath: '',
      sources: [],
      samples: [],
      settings: {
        activeStep: 'Intake',
        selectedSampleId: '',
        metricKey: 'bAmplitudeUv',
        metricVersion: 'raw',
        recordFilter: 'All',
        biologicalUnit: 'subject',
        eyeAggregation: 'average-eyes',
        comparisonDesign: 'independent',
      },
    }
  }

  function normalizeProject(project) {
    const base = project && typeof project === 'object' ? project : createEmptyProject()
    const samples = Array.isArray(base.samples) ? base.samples.map(normalizeSample) : []
    const selectedSampleId =
      base.settings && samples.some((sample) => sample.id === base.settings.selectedSampleId)
        ? base.settings.selectedSampleId
        : samples[0]
          ? samples[0].id
          : ''
    return {
      schema: 'erg-viewer-v2-project',
      version: 1,
      title: String(base.title || 'Untitled ERG project'),
      createdAt: base.createdAt || new Date().toISOString(),
      savedAt: base.savedAt || '',
      projectFilePath: String(base.projectFilePath || ''),
      sources: Array.isArray(base.sources) ? base.sources.map(normalizeSource) : deriveSources(samples),
      samples,
      settings: {
        activeStep: base.settings && base.settings.activeStep ? base.settings.activeStep : 'Intake',
        selectedSampleId,
        metricKey: base.settings && base.settings.metricKey ? base.settings.metricKey : 'bAmplitudeUv',
        metricVersion: normalizeMetricVersion(base.settings && base.settings.metricVersion),
        recordFilter: base.settings && base.settings.recordFilter ? base.settings.recordFilter : 'All',
        analysisSourceType:
          base.settings && base.settings.analysisSourceType ? base.settings.analysisSourceType : '',
        analysisProtocolMode:
          base.settings && base.settings.analysisProtocolMode ? base.settings.analysisProtocolMode : '',
        analysisProtocolFamily:
          base.settings && base.settings.analysisProtocolFamily ? base.settings.analysisProtocolFamily : '',
        analysisCondition:
          base.settings && base.settings.analysisCondition ? base.settings.analysisCondition : '',
        reportScope: base.settings && base.settings.reportScope ? base.settings.reportScope : '',
        statsPolicy: base.settings && base.settings.statsPolicy ? base.settings.statsPolicy : '',
        grouping: base.settings && base.settings.grouping ? base.settings.grouping : '',
        biologicalUnit: normalizeChoice(
          base.settings && base.settings.biologicalUnit,
          ['subject', 'acquisition'],
          'subject'
        ),
        eyeAggregation: normalizeChoice(
          base.settings && base.settings.eyeAggregation,
          ['average-eyes', 'right-eye', 'left-eye'],
          'average-eyes'
        ),
        comparisonDesign: normalizeChoice(
          base.settings && base.settings.comparisonDesign,
          ['independent', 'paired'],
          'independent'
        ),
      },
      correctionLog: buildCorrectionLog(samples),
    }
  }

  function normalizeChoice(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback
  }

  function normalizeMetricVersion(value) {
    const text = String(value || '').toLowerCase()
    if (text === 'manual' || text === 'corrected') return 'manual'
    return 'raw'
  }

  function normalizeSource(source) {
    const modes = normalizeSourceModes(source)
    return {
      name: String(source.name || 'Unknown source'),
      path: String(source.path || ''),
      key: String(source.key || source.path || source.name || 'Unknown source'),
      type: String(source.type || sourceTypeFromModes(modes)),
      mode: modes.join(', ') || 'Unknown',
      modes,
      records: Number(source.records) || 0,
      importedAt: source.importedAt || '',
    }
  }

  function normalizeSourceModes(source) {
    if (Array.isArray(source && source.modes)) {
      return uniqueModes(source.modes)
    }
    return uniqueModes(
      String((source && source.mode) || 'Unknown')
        .split(',')
        .map((item) => item.trim())
    )
  }

  function deriveSources(samples) {
    const sources = new Map()
    samples.forEach((sample) => {
      const name = sample.sourceName || 'Synthetic demo'
      const key = sourceKeyFromSample(sample)
      const existing = sources.get(key) || {
        key,
        name,
        path: sample.metadata && sample.metadata.sourcePath ? sample.metadata.sourcePath : '',
        type: sourceTypeFromMode(sample.mode),
        modes: [],
        records: 0,
        importedAt: sample.metadata && sample.metadata.importedAt ? sample.metadata.importedAt : '',
      }
      existing.modes = uniqueModes([...(existing.modes || []), sample.mode || 'Unknown'])
      existing.type = sourceTypeFromModes(existing.modes)
      existing.records += 1
      sources.set(key, existing)
    })
    return Array.from(sources.values()).map(normalizeSource)
  }

  function sourceKeyFromSample(sample) {
    return (
      (sample && sample.metadata && sample.metadata.sourcePath) ||
      (sample && sample.sourceName) ||
      'Unknown source'
    )
  }

  function sourceTypeFromMode(mode) {
    return String(mode || '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
  }

  function sourceTypeFromModes(modes) {
    const normalized = uniqueModes(Array.isArray(modes) ? modes : [modes])
    return normalized.length > 0 && normalized.every((mode) => sourceTypeFromMode(mode) === 'FVEP')
      ? 'FVEP'
      : 'ERG'
  }

  function uniqueModes(modes) {
    return Array.from(new Set((modes || []).map((mode) => String(mode || '').trim()).filter(Boolean))).sort(
      (left, right) => left.localeCompare(right)
    )
  }

  function removeSourceFromProject(project, sourceKey) {
    const normalized = normalizeProject(project)
    const samples = normalized.samples.filter((sample) => sourceKeyFromSample(sample) !== sourceKey)
    const nextSelectedSampleId = samples.some((sample) => sample.id === normalized.settings.selectedSampleId)
      ? normalized.settings.selectedSampleId
      : samples[0]
        ? samples[0].id
        : ''
    const recordFilterIsValid =
      normalized.settings.recordFilter &&
      (normalized.settings.recordFilter === 'All' ||
        samples.some((sample) => {
          if (normalized.settings.recordFilter === 'ERG') return sourceTypeFromMode(sample.mode) === 'ERG'
          if (normalized.settings.recordFilter === 'FVEP') return sourceTypeFromMode(sample.mode) === 'FVEP'
          return true
        }))
    return normalizeProject({
      ...normalized,
      savedAt: '',
      samples,
      sources: deriveSources(samples),
      settings: {
        ...normalized.settings,
        activeStep: samples.length ? normalized.settings.activeStep : 'Intake',
        selectedSampleId: nextSelectedSampleId,
        recordFilter: recordFilterIsValid ? normalized.settings.recordFilter : 'All',
      },
    })
  }

  function buildCorrectionLog(samples) {
    return samples
      .filter((sample) => {
        const manual = sample.corrections && sample.corrections.manualPoints
        return countManualPoints(manual) > 0
      })
      .map((sample) => ({
        sampleId: sample.id,
        subjectId: sample.subjectId,
        acquisitionId: sample.acquisitionId,
        mode: sample.mode,
        manualPoints: countManualPoints(sample.corrections && sample.corrections.manualPoints),
      }))
  }

  function countManualPoints(manualPoints) {
    const manual = manualPoints && typeof manualPoints === 'object' ? manualPoints : {}
    return ['right', 'left'].reduce((total, side) => {
      const points = manual[side] && typeof manual[side] === 'object' ? manual[side] : {}
      const ordinary = ['a', 'b', 'N1', 'P1', 'N2', 'P2', 'flickerTrough', 'flickerPeak'].filter((key) =>
        isPoint(points[key])
      ).length
      const ops = Array.isArray(points.ops)
        ? points.ops.reduce(
            (sum, item) =>
              sum + (isPoint(item && item.peak) ? 1 : 0) + (isPoint(item && item.valley) ? 1 : 0),
            0
          )
        : 0
      return total + ordinary + ops
    }, 0)
  }

  function normalizeSample(sample) {
    const metadata = sample.metadata && typeof sample.metadata === 'object' ? sample.metadata : {}
    const inference = normalizeInference(sample.inference, sample, metadata)
    const normalized = {
      id: String(sample.id || makeId(sample.label || sample.sourceName || 'sample')),
      label: String(sample.label || sample.sourceName || 'Sample'),
      subjectId: String(sample.subjectId || sample.label || sample.sourceName || 'Sample'),
      acquisitionId: String(sample.acquisitionId || sample.condition || 'acquisition'),
      pairedId: String(
        sample.pairedId || inference.pairedId || inferPairedId(sample.subjectId || sample.label)
      ),
      cohort: String(
        sample.cohort || inference.cohort || inferCohort(sample.label || sample.sourceName || 'Sample')
      ),
      mode: String(sample.mode || 'FERG'),
      condition: String(sample.condition || 'Unknown condition'),
      sourceName: String(sample.sourceName || ''),
      included: sample.included !== false,
      metadata,
      inference,
      traces: normalizeTraces(sample.traces),
      machineMarks: normalizeMachineMarks(sample.machineMarks),
      corrections: normalizeCorrections(sample.corrections),
      qc: Array.isArray(sample.qc) ? sample.qc : [],
    }
    normalized.metrics = {
      raw: sample.metrics && sample.metrics.raw ? sample.metrics.raw : metrics.deriveRawMetrics(normalized),
    }
    if (!normalized.qc.length) normalized.qc = buildQc(normalized)
    return normalized
  }

  function normalizeInference(inference, sample, metadata) {
    const sourceText = `${sample.sourceName || ''} ${sample.label || ''} ${sample.subjectId || ''}`
    const metadataCohort = metadata && metadata.cohort ? String(metadata.cohort) : ''
    const suggestedCohort = metadataCohort || inferCohort(sourceText)
    const pairedId = inferPairedId(sample.subjectId || sample.label || sample.sourceName || '')
    const existing = inference && typeof inference === 'object' ? inference : {}
    return {
      cohort: String(existing.cohort || suggestedCohort || 'Unassigned'),
      cohortSource: String(existing.cohortSource || (metadataCohort ? 'metadata' : 'filename')),
      pairedId: String(existing.pairedId || pairedId),
      pairedIdSource: String(existing.pairedIdSource || 'subject'),
    }
  }

  function normalizeMachineMarks(machineMarks) {
    return {
      right: String((machineMarks && machineMarks.right) || ''),
      left: String((machineMarks && machineMarks.left) || ''),
    }
  }

  function normalizeCorrections(corrections) {
    const manual = corrections && corrections.manualPoints ? corrections.manualPoints : corrections || {}
    return {
      manualPoints: {
        right: normalizeManualSide(manual.right),
        left: normalizeManualSide(manual.left),
      },
      excludedEyes: {
        right: corrections && corrections.excludedEyes ? corrections.excludedEyes.right === true : false,
        left: corrections && corrections.excludedEyes ? corrections.excludedEyes.left === true : false,
      },
      legacy: {
        amplitudeScale: Number(corrections && corrections.amplitudeScale) || 1,
        latencyShiftMs: Number(corrections && corrections.latencyShiftMs) || 0,
      },
    }
  }

  function normalizeManualSide(side) {
    const out = {}
    ;['a', 'b', 'N1', 'P1', 'N2', 'P2', 'flickerTrough', 'flickerPeak'].forEach((key) => {
      if (isPoint(side && side[key])) out[key] = normalizePoint(side[key])
    })
    const ops = Array.isArray(side && side.ops) ? side.ops : []
    out.ops = Array.from({ length: 5 }, (_item, index) => {
      const item = ops[index] || {}
      return {
        ...(isPoint(item.peak) ? { peak: normalizePoint(item.peak) } : {}),
        ...(isPoint(item.valley) ? { valley: normalizePoint(item.valley) } : {}),
      }
    })
    return out
  }

  function isPoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
  }

  function normalizePoint(point) {
    return { x: Number(point.x), y: Number(point.y) }
  }

  function normalizeTraces(traces) {
    const fallback = { x: [], y: [] }
    return {
      right: traces && traces.right ? normalizeTrace(traces.right) : fallback,
      left: traces && traces.left ? normalizeTrace(traces.left) : fallback,
    }
  }

  function normalizeTrace(trace) {
    const y = Array.isArray(trace.y) ? trace.y.map(Number).filter(Number.isFinite) : []
    const x =
      Array.isArray(trace.x) && trace.x.length === y.length
        ? trace.x.map(Number).filter(Number.isFinite)
        : y.map((_value, index) => index)
    return { x, y }
  }

  function parseWorkbookToSamples(workbook, sourceName) {
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) return []
    const parsed = workbook.SheetNames.flatMap((sheetName, index) => {
      const sheet = workbook.Sheets[sheetName]
      const rows = sheetToRows(sheet)
      const templateSamples = rowsToOptoprobeRecords(rows, sourceName, sheetName, index)
      if (templateSamples.length) return templateSamples
      return [rowsToFallbackRecord(rows, sourceName, sheetName, index)]
    })
    return parsed.filter((sample) => sample && (sample.traces.right.y.length || sample.traces.left.y.length))
  }

  function hasExpectedWorkbookFormat(records) {
    return (
      Array.isArray(records) &&
      records.length > 0 &&
      records.some((sample) => !(sample.metadata && sample.metadata.fallbackParser))
    )
  }

  function isProjectFilePayload(payload) {
    return Boolean(
      payload &&
        typeof payload === 'object' &&
        payload.schema === 'erg-viewer-v2-project' &&
        Array.isArray(payload.samples)
    )
  }

  function sheetToRows(sheet) {
    const XLSX = getXlsx()
    if (!XLSX || !sheet) return []
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false })
  }

  function getXlsx() {
    if (typeof window !== 'undefined' && window.ergLibs && window.ergLibs.XLSX) return window.ergLibs.XLSX
    if (typeof globalThis !== 'undefined' && globalThis.XLSX) return globalThis.XLSX
    if (typeof require === 'function') {
      try {
        return require('xlsx')
      } catch {}
    }
    return null
  }

  function rowsToOptoprobeRecords(rows, sourceName, sheetName, sheetIndex) {
    const metadata = extractMetadata(rows)
    const mode = inferMode(`${metadata.exam || ''} ${sourceName || ''} ${sheetName || ''}`)
    const subjectId =
      metadata.subject || stripModalitySuffix(basename(sourceName)) || `Subject ${sheetIndex + 1}`
    const cohort = metadata.cohort || inferCohort(`${sourceName || ''} ${subjectId}`)
    const acquisitions = new Map()

    rows.forEach((row) => {
      const param = String(row[1] || '')
      const value = row[2]
      const match = param.match(/^\[(R|L)_(\d+)_([^\]]+)\]$/)
      if (!match) return
      const side = match[1] === 'R' ? 'right' : 'left'
      const acquisitionId = match[2]
      const key = match[3]
      if (!acquisitions.has(acquisitionId)) {
        acquisitions.set(acquisitionId, {
          acquisitionId,
          right: {},
          left: {},
        })
      }
      acquisitions.get(acquisitionId)[side][key] = value
    })

    return Array.from(acquisitions.values()).map((acquisition) => {
      const conditionName = String(
        acquisition.right['名字'] || acquisition.left['名字'] || `Acquisition ${acquisition.acquisitionId}`
      )
      const flash = String(acquisition.right['闪光'] || acquisition.left['闪光'] || '')
      const condition = [conditionName, flash].filter(Boolean).join(' · ')
      const acquisitionMode = inferMode(`${mode} ${conditionName} ${flash}`)
      return normalizeSample({
        id: `${makeId(subjectId)}-${makeId(acquisitionMode)}-${acquisition.acquisitionId}-${makeId(conditionName)}`,
        label: `${subjectId} · ${acquisitionMode} ${acquisition.acquisitionId}`,
        subjectId,
        acquisitionId: acquisition.acquisitionId,
        cohort,
        pairedId: inferPairedId(subjectId),
        mode: acquisitionMode,
        condition,
        sourceName: basename(sourceName),
        traces: {
          right: detailValueToTrace(acquisition.right['详细数据(uv)'], acquisition.right),
          left: detailValueToTrace(acquisition.left['详细数据(uv)'], acquisition.left),
        },
        machineMarks: {
          right: String(acquisition.right['标记'] || ''),
          left: String(acquisition.left['标记'] || ''),
        },
        metadata: {
          ...metadata,
          sheet: sheetName,
          importedRows: rows.length,
          sourcePath: sourceName || '',
          importedAt: new Date().toISOString(),
          rightName: acquisition.right['名字'] || '',
          leftName: acquisition.left['名字'] || '',
          rightSampling: acquisition.right['采样'] || '',
          leftSampling: acquisition.left['采样'] || '',
          rightAnalysisTime: acquisition.right['分析时间'] || '',
          leftAnalysisTime: acquisition.left['分析时间'] || '',
        },
        inference: {
          cohort,
          cohortSource: metadata.cohort ? 'metadata' : 'filename',
          pairedId: inferPairedId(subjectId),
          pairedIdSource: 'subject',
        },
        corrections: {},
      })
    })
  }

  function extractMetadata(rows) {
    const out = {}
    rows.forEach((row) => {
      const param = String(row[1] || '')
      const value = String(row[2] == null ? '' : row[2])
      if (param.includes('检查项目')) out.exam = value
      if (param.includes('病人_姓名')) out.subject = value
      if (param.includes('检查_病人分组')) out.cohort = value
      if (param.includes('检查_检查日期')) out.date = value
      if (param.includes('医院_医院名字')) out.site = value
    })
    return out
  }

  function detailValueToTrace(value, sideFields) {
    const text = String(value == null ? '' : value).trim()
    if (!text) return { x: [], y: [] }
    const y = text
      .split(/[,\s;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite)
    const totalMs = parseDurationMs(sideFields && sideFields['分析时间'])
    const x =
      totalMs && y.length > 1
        ? y.map((_item, index) => Number(((index * totalMs) / (y.length - 1)).toFixed(4)))
        : y.map((_item, index) => index)
    return { x, y }
  }

  function parseDurationMs(value) {
    const match = String(value || '').match(/[+-]?\d+(?:\.\d+)?/)
    const number = match ? Number(match[0]) : null
    return Number.isFinite(number) && number > 0 ? number : null
  }

  function rowsToFallbackRecord(rows, sourceName, sheetName, index) {
    const trace = rowsToTrace(rows)
    return normalizeSample({
      id: `${makeId(sourceName || 'excel')}-${index + 1}`,
      label: `${stripModalitySuffix(basename(sourceName)) || sheetName || `Sample ${index + 1}`} · ${inferMode(`${sourceName || ''} ${sheetName || ''}`)}`,
      subjectId: stripModalitySuffix(basename(sourceName)) || sheetName || `Sample ${index + 1}`,
      acquisitionId: String(index + 1),
      cohort: inferCohort(`${sourceName || ''} ${sheetName || ''}`),
      pairedId: inferPairedId(
        stripModalitySuffix(basename(sourceName)) || sheetName || `Sample ${index + 1}`
      ),
      mode: inferMode(`${sourceName || ''} ${sheetName || ''}`),
      condition: inferCondition(rows, sheetName),
      sourceName: basename(sourceName),
      traces: {
        right: trace.right,
        left: trace.left,
      },
      metadata: {
        sheet: sheetName,
        importedRows: rows.length,
        sourcePath: sourceName || '',
        importedAt: new Date().toISOString(),
        fallbackParser: true,
      },
      inference: {
        cohort: inferCohort(`${sourceName || ''} ${sheetName || ''}`),
        cohortSource: 'filename',
        pairedId: inferPairedId(
          stripModalitySuffix(basename(sourceName)) || sheetName || `Sample ${index + 1}`
        ),
        pairedIdSource: 'subject',
      },
      corrections: {},
    })
  }

  function rowsToTrace(rows) {
    const numericRows = rows
      .map((row) => (Array.isArray(row) ? row.map(Number).filter(Number.isFinite) : []))
      .filter((row) => row.length >= 2)
    if (!numericRows.length) return { right: { x: [], y: [] }, left: { x: [], y: [] } }

    const right = { x: [], y: [] }
    const left = { x: [], y: [] }
    numericRows.forEach((row, index) => {
      const x = Number.isFinite(row[0]) ? row[0] : index
      right.x.push(x)
      right.y.push(row[1])
      if (Number.isFinite(row[2])) {
        left.x.push(x)
        left.y.push(row[2])
      }
    })
    if (!left.y.length) {
      left.x = right.x.slice()
      left.y = right.y.map((value) => Number((value * 0.96).toFixed(3)))
    }
    return { right, left }
  }

  function buildQc(sample) {
    const items = []
    if (!sample.traces.right.y.length && !sample.traces.left.y.length) {
      items.push({ level: 'warn', message: 'No numeric trace columns were detected.' })
    }
    if (sample.traces.right.y.length && !sample.traces.left.y.length) {
      items.push({ level: 'warn', message: 'Left eye trace is missing; metrics use available right-eye data.' })
    }
    if (!sample.traces.right.y.length && sample.traces.left.y.length) {
      items.push({ level: 'warn', message: 'Right eye trace is missing; metrics use available left-eye data.' })
    }
    if ((sample.traces.right.y.length || 0) < 20) {
      items.push({ level: 'warn', message: 'Trace contains few points; confirm worksheet layout.' })
    }
    if (!items.length) items.push({ level: 'ok', message: 'Imported trace is ready for review.' })
    return items
  }

  function inferCohort(value) {
    const text = String(value || '').toLowerCase()
    if (text.includes('cko') || text.includes('mut') || text.includes('ko')) return 'CKO'
    if (text.includes('control') || text.includes('ctrl') || text.includes('wt')) return 'Control'
    return 'Unassigned'
  }

  function inferMode(value) {
    const text = String(value || '').toLowerCase()
    if (text.includes('fvep') || text.includes('vep')) return 'FVEP'
    if (text.includes('flicker')) return 'Flicker'
    if (text.includes('ops')) return 'dOps'
    return 'FERG'
  }

  function inferPairedId(value) {
    return (
      stripModalitySuffix(String(value || ''))
        .replace(/\.(xlsx|xls)$/i, '')
        .replace(/\s+/g, ' ')
        .trim() || 'Unassigned'
    )
  }

  function inferCondition(rows, fallback) {
    const flat = rows
      .flat()
      .map((item) => String(item || ''))
      .join(' ')
    const match = flat.match(/(?:dMax|dRod|lCone|cd\.?s\/m2|Hz)[\w\s./-]{0,24}/i)
    return match ? match[0].trim() : String(fallback || 'Default condition')
  }

  function makeId(value) {
    return (
      String(value || 'sample')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'sample'
    )
  }

  function basename(filePath) {
    const text = String(filePath || '')
    return text.split(/[\\/]/).filter(Boolean).pop() || text
  }

  function stripModalitySuffix(value) {
    return String(value || '')
      .replace(/\.(xlsx|xls)$/i, '')
      .replace(/[_\s-]*(FERG|ERG|FVEP|VEP)$/i, '')
      .trim()
  }

  return {
    createEmptyProject,
    normalizeProject,
    normalizeSample,
    inferCohort,
    inferPairedId,
    parseWorkbookToSamples,
    hasExpectedWorkbookFormat,
    isProjectFilePayload,
    rowsToOptoprobeRecords,
    deriveSources,
    sourceKeyFromSample,
    sourceTypeFromMode,
    sourceTypeFromModes,
    removeSourceFromProject,
    buildCorrectionLog,
    countManualPoints,
    inferCohort,
    inferMode,
    makeId,
  }
})
