;(function bootstrap() {
  const libs = window.ergLibs || {}
  const React = libs.React || window.React
  const ReactDOM = libs.ReactDOM || window.ReactDOM
  const Plotly = libs.Plotly || window.Plotly
  const XLSX = libs.XLSX || window.XLSX
  const protocols = window.ERGv2Protocols
  const metrics = window.ERGv2Metrics
  const manualPicks = window.ERGv2ManualPicks
  const demo = window.ERGv2DemoData
  const projectCore = window.ERGv2Project
  const analysisCore = window.ERGv2Analysis
  const reportCore = window.ERGv2Report
  const exportCore = window.ERGv2Export
  const api = window.ergAPI
  const e = React.createElement

  const STEPS = ['Intake', 'Review', 'Analysis', 'Report']
  const FILTERS = ['ERG', 'FVEP']
  const ACQUISITION_CATEGORY_ORDER = ['Rod', 'Max', 'Cone', 'OPs', 'Flicker', 'Other']
  const WORKBOOK_SHEETS = [
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
    'statistical_design',
    'analysis_plan',
    'analysis_source',
    'analysis_warnings',
    'paired_readiness',
    'report_figures',
    'report_scopes',
    'report_readiness',
  ]
  const METRICS = protocols.metricEntries()
  const PROJECT_FILE_EXTENSION = 'ep'
  const LEGACY_PROJECT_FILE_EXTENSIONS = ['ergproject', 'json']

  function App() {
    const [project, setProject] = React.useState(() => projectCore.normalizeProject(projectCore.createEmptyProject()))
    const [statusMessage, setStatus] = React.useState('Ready for import')
    const [appInfo, setAppInfo] = React.useState(null)
    const qaExportStarted = React.useRef(false)
    const qaStateWritten = React.useRef(false)
    const qaInteractionStarted = React.useRef(false)
    const qaQuitStarted = React.useRef(false)

    React.useEffect(() => {
      if (api && api.appInfo)
        api
          .appInfo()
          .then(setAppInfo)
          .catch(() => {})
      if (!api || (!api.getStartupProject && !api.getStartupFile && !api.getStartupFiles)) return undefined
      const startupProject = api.getStartupProject ? api.getStartupProject() : ''
      const startupFiles = api.getStartupFiles ? api.getStartupFiles() : []
      const startup = startupFiles.length
        ? startupFiles
        : [api.getStartupFile && api.getStartupFile()].filter(Boolean)
      if (startupProject) loadProjectFile(startupProject)
      else if (startup.length) importExcelFiles(startup)
      const cleanupProject = api.onStartupProject
        ? api.onStartupProject((filePath) => filePath && loadProjectFile(filePath))
        : null
      const cleanupFiles = api.onStartupFiles
        ? api.onStartupFiles((filePaths) => filePaths.length && importExcelFiles(filePaths))
        : null
      const cleanupFile = api.onStartupFile
        ? api.onStartupFile((filePath) => importExcelFiles([filePath]))
        : null
      return () => {
        cleanupProject && cleanupProject()
        cleanupFiles && cleanupFiles()
        cleanupFile && cleanupFile()
      }
    }, [])

    const settings = project.settings || {}
    const samples = project.samples || []
    const effectiveFilter = effectiveRecordFilter(settings.recordFilter, samples)
    const visibleSamples = samples.filter((sample) => matchesRecordFilter(sample, effectiveFilter))
    const selectedSample =
      visibleSamples.find((sample) => sample.id === settings.selectedSampleId) ||
      (visibleSamples.length
        ? visibleSamples[0]
        : samples.find((sample) => sample.id === settings.selectedSampleId)) ||
      samples[0] ||
      null
    const comparisonMode = selectedSample && selectedSample.mode ? selectedSample.mode : ''
    const comparisonSamples = comparisonMode
      ? visibleSamples.filter((sample) => sample.mode === comparisonMode)
      : visibleSamples
    const defaultAnalysisSourceType =
      settings.analysisSourceType ||
      (availableRecordFilters(samples).includes('ERG')
        ? 'ERG'
        : ['ERG', 'FVEP'].includes(effectiveFilter)
          ? effectiveFilter
          : 'All')
    const defaultAnalysisCategoryKey =
      settings.analysisCategoryKey ||
      ((analysisModeOptions(samples, defaultAnalysisSourceType)[0] || {}).key || '')
    const defaultAnalysisSample = firstSampleForAnalysisCategory(
      samples,
      defaultAnalysisSourceType,
      defaultAnalysisCategoryKey
    )
    const defaultAnalysisProtocolFamily = defaultAnalysisSample
      ? recordSourceType(defaultAnalysisSample) === 'FVEP'
        ? 'All'
        : parseConditionLabel(defaultAnalysisSample.condition).protocolFamily || 'All'
      : 'All'
    const analysisPlan = analysisCore
      ? analysisCore.buildAnalysisPlan(project, {
          sourceType:
            defaultAnalysisSourceType,
          protocolMode: settings.analysisProtocolMode || (defaultAnalysisSample && defaultAnalysisSample.mode) || comparisonMode || 'All',
          protocolFamily: settings.analysisProtocolFamily || defaultAnalysisProtocolFamily,
          condition: settings.analysisCondition || 'All',
          metricKey: settings.metricKey,
          metricVersion: settings.metricVersion,
          statsPolicy: settings.statsPolicy,
          biologicalUnit: settings.biologicalUnit,
          eyeAggregation: settings.eyeAggregation,
          comparisonDesign: settings.comparisonDesign,
        })
      : null
    const analysisResult = analysisCore ? analysisCore.runAnalysis(project, analysisPlan) : null
    const reportScope = settings.reportScope || 'current'
    const reportPlan = buildReportAnalysisPlan(analysisPlan, reportScope)
    const reportResult = analysisCore
      ? reportScope === 'current'
        ? analysisResult
        : analysisCore.runAnalysis(project, reportPlan)
      : null
    const analysisOptions =
      analysisCore && analysisCore.availableAnalysisOptions
        ? analysisCore.availableAnalysisOptions(project, analysisPlan)
        : null
    const reportPackage =
      reportCore && reportCore.buildReportPackage
        ? reportCore.buildReportPackage(projectCore.normalizeProject(project), reportResult, { reportScope })
        : null
    const groupSummary = analysisResult
      ? analysisResult.cohortSummary.length
        ? analysisResult.cohortSummary
        : analysisResult.conditionSummary
      : metrics.summarizeGroups(comparisonSamples, settings.metricKey, settings.metricVersion)
    const reportSummary = reportResult
      ? reportResult.cohortSummary.length
        ? reportResult.cohortSummary
        : reportResult.conditionSummary
      : groupSummary
    const sourceRows = analysisResult
      ? analysisResult.sourceRows
      : metrics.buildSourceRows(comparisonSamples, settings.metricKey, settings.metricVersion)
    const workbookExportRows =
      settings.activeStep === 'Report' || settings.activeStep === 'Export'
        ? reportResult && reportResult.sourceRows
        : sourceRows
    const canExportWorkbook = Array.isArray(workbookExportRows) && workbookExportRows.length > 0
    function updateSettings(patch, options = {}) {
      setProject((current) =>
        projectCore.normalizeProject({
          ...current,
          savedAt: options.dirty ? '' : current.savedAt,
          settings: { ...current.settings, ...patch },
        })
      )
    }

    function updateAnalysisPlan(patch) {
      const reset = {}
      if (Object.prototype.hasOwnProperty.call(patch, 'analysisSourceType')) {
        reset.analysisProtocolMode = 'All'
        reset.analysisProtocolFamily = 'All'
        reset.analysisCondition = 'All'
        if (['ERG', 'FVEP'].includes(patch.analysisSourceType)) reset.recordFilter = patch.analysisSourceType
        reset.metricKey = protocols.compatibleMetricForPlan(settings.metricKey, {
          sourceType: patch.analysisSourceType,
          protocolMode: reset.analysisProtocolMode,
        })
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'analysisProtocolMode')) {
        reset.analysisProtocolFamily = 'All'
        reset.analysisCondition = 'All'
        reset.metricKey = protocols.compatibleMetricForPlan(settings.metricKey, {
          sourceType: patch.analysisSourceType || settings.analysisSourceType || settings.recordFilter,
          protocolMode: patch.analysisProtocolMode,
        })
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'analysisProtocolFamily')) {
        reset.analysisCondition = 'All'
      }
      updateSettings({ ...patch, ...reset }, { dirty: true })
    }

    function updateReportScope(reportScope) {
      const sourceType = reportScopeSourceType(reportScope)
      updateSettings(
        {
          reportScope,
          ...(sourceType
            ? {
                recordFilter: sourceType,
                analysisSourceType: sourceType,
                analysisProtocolMode: sourceType === 'FVEP' ? 'FVEP' : 'All',
                analysisProtocolFamily: 'All',
                analysisCondition: 'All',
                metricKey: protocols.compatibleMetricForPlan(settings.metricKey, {
                  sourceType,
                  protocolMode: sourceType === 'FVEP' ? 'FVEP' : 'All',
                }),
              }
            : {}),
        },
        { dirty: true }
      )
    }

    function updateSample(sampleId, updater) {
      setProject((current) =>
        projectCore.normalizeProject({
          ...current,
          savedAt: '',
          samples: current.samples.map((sample) => (sample.id === sampleId ? updater(sample) : sample)),
        })
      )
    }

    function updateReviewScope(patch) {
      const nextSample = selectReviewSample(project.samples || [], selectedSample, patch || {})
      if (!nextSample) return
      const nextType = recordSourceType(nextSample)
      updateSettings(
        {
          selectedSampleId: nextSample.id,
          recordFilter: nextType,
          analysisSourceType: nextType,
        },
        { dirty: false }
      )
    }

    function updateAnalysisMode(categoryKey) {
      const sourceType =
        settings.analysisSourceType || (['ERG', 'FVEP'].includes(effectiveFilter) ? effectiveFilter : 'ERG')
      const sample = firstSampleForAnalysisCategory(project.samples || [], sourceType, categoryKey)
      if (!sample) return
      const family = recordSourceType(sample) === 'FVEP' ? 'All' : parseConditionLabel(sample.condition).protocolFamily || 'All'
      updateSettings(
        {
          analysisSourceType: recordSourceType(sample),
          analysisProtocolMode: sample.mode || 'All',
          analysisProtocolFamily: family,
          analysisCondition: 'All',
          analysisCategoryKey: categoryKey,
          metricKey: protocols.compatibleMetricForPlan(settings.metricKey, {
            sourceType: recordSourceType(sample),
            protocolMode: sample.mode || 'All',
          }),
        },
        { dirty: true }
      )
    }

    function removeSourceFile(sourceKey) {
      setProject((current) => {
        if (projectCore.removeSourceFromProject)
          return projectCore.removeSourceFromProject(current, sourceKey)
        return current
      })
      setStatus('Source file removed from project')
    }

    async function notifyWarning(message) {
      const text = String(message || 'Warning')
      setStatus(text.split(/\r?\n/)[0])
      if (!api || !api.showWarning || isQaRuntime()) return
      try {
        await api.showWarning(text)
      } catch {}
    }

    function isQaRuntime() {
      return Boolean(
        (api.getQaStateDir && api.getQaStateDir()) ||
          (api.getQaExportDir && api.getQaExportDir()) ||
          (api.getQaInteractionSmoke && api.getQaInteractionSmoke()) ||
          (api.getQaQuitSmoke && api.getQaQuitSmoke())
      )
    }

    async function importExcelFiles(filePaths) {
      if (!XLSX || !api) {
        setStatus('Excel import is unavailable in this runtime')
        return
      }
      const imported = []
      const failed = []
      for (const filePath of filePaths || []) {
        try {
          const buffer = await api.readFileBuffer(filePath)
          const workbook = XLSX.read(toWorkbookBytes(buffer), { type: 'array' })
          const records = projectCore.parseWorkbookToSamples(workbook, filePath)
          if (!isExpectedWorkbookImport(records)) {
            throw new Error('not an ERG/FVEP acquisition workbook')
          }
          imported.push(...records)
        } catch (error) {
          failed.push({
            filePath,
            reason: friendlyImportError(error, 'Excel'),
          })
        }
      }
      if (!imported.length) {
        await notifyWarning(
          failed.length
            ? `No valid ERG/FVEP workbook was imported.\n\n${formatImportFailures(failed)}`
            : 'No valid ERG/FVEP workbook was imported.'
        )
        return
      }
      try {
        const qaSelectMode = api.getQaSelectMode ? api.getQaSelectMode() : ''
        const qaActiveStep = api.getQaActiveStep ? api.getQaActiveStep() : ''
        const qaAnalysisCondition = api.getQaAnalysisCondition ? api.getQaAnalysisCondition() : ''
        const selectedSample =
          imported.find((sample) => qaSelectMode && sample.mode === qaSelectMode) || imported[0]
        const qaRecordFilter = FILTERS.includes(qaSelectMode) ? qaSelectMode : ''
        setProject((current) => {
          const currentProject = projectCore.normalizeProject(current)
          const replaceCurrent = isDemoOnlyProject(currentProject) || !(currentProject.samples || []).length
          const importedSourceKeys = new Set(imported.map((sample) => sourceKeyFromSample(sample)))
          const retainedSamples = replaceCurrent
            ? []
            : currentProject.samples.filter((sample) => !importedSourceKeys.has(sourceKeyFromSample(sample)))
          const samples = [...retainedSamples, ...imported]
          const shouldRenameProject = replaceCurrent || currentProject.title === 'Untitled ERG project'
          return projectCore.normalizeProject({
            ...currentProject,
            title: shouldRenameProject
              ? importedSourceKeys.size === 1
                ? sourceAliasFromFilename(imported[0].sourceName || imported[0].subjectId)
                : 'Imported ERG/FVEP project'
              : currentProject.title,
            projectFilePath: replaceCurrent ? '' : currentProject.projectFilePath,
            savedAt: '',
            samples,
            sources: projectCore.deriveSources(samples),
            settings: {
              ...currentProject.settings,
              activeStep: ['Intake', 'Review', 'Analysis', 'Report', 'Export'].includes(qaActiveStep)
                ? qaActiveStep
                : 'Intake',
              metricVersion: 'raw',
              recordFilter: qaRecordFilter || currentProject.settings.recordFilter,
              selectedSampleId: selectedSample.id,
              analysisSourceType: qaRecordFilter || currentProject.settings.analysisSourceType,
              analysisProtocolMode: selectedSample.mode || currentProject.settings.analysisProtocolMode,
              analysisProtocolFamily:
                parseConditionLabel(selectedSample.condition).protocolFamily ||
                currentProject.settings.analysisProtocolFamily,
              analysisCondition:
                qaAnalysisCondition === 'first'
                  ? selectedSample.condition
                  : qaAnalysisCondition || currentProject.settings.analysisCondition,
            },
          })
        })
        const message = failed.length
          ? `Imported ${imported.length} record${imported.length === 1 ? '' : 's'}; skipped ${failed.length} file${failed.length === 1 ? '' : 's'}`
          : `Imported ${imported.length} record${imported.length === 1 ? '' : 's'}`
        setStatus(message)
        if (failed.length) await notifyWarning(`${message}.\n\n${formatImportFailures(failed)}`)
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Import failed')
      }
    }

    async function loadProjectFile(filePath) {
      if (!api) return
      try {
        const text = await api.readTextFile(filePath)
        const qaActiveStep = api.getQaActiveStep ? api.getQaActiveStep() : ''
        const parsed = JSON.parse(text)
        if (!isExpectedProjectPayload(parsed)) {
          throw new Error('not an ERG Viewer project file')
        }
        const loaded = projectCore.normalizeProject({
          ...parsed,
          projectFilePath: filePath,
        })
        setProject(
          projectCore.normalizeProject({
            ...loaded,
            settings: {
              ...loaded.settings,
              activeStep: ['Intake', 'Review', 'Analysis', 'Report', 'Export'].includes(qaActiveStep)
                ? qaActiveStep
                : 'Intake',
            },
          })
        )
        setStatus('Project opened for reproducible analysis')
      } catch (error) {
        await notifyWarning(`Project open failed: ${friendlyImportError(error, 'Project')}`)
      }
    }

    async function chooseExcel() {
      if (!api) return
      const paths = await api.openExcel({ multi: true })
      if (paths && paths.length) await importExcelFiles(paths)
    }

    async function openProject() {
      if (!api) return
      const filePath = await api.openProject()
      if (filePath) await loadProjectFile(filePath)
    }

    async function saveProject() {
      if (!api) return
      try {
        const filePath = await api.saveDialog({
          title: 'Save ERG Viewer v2 Project',
          defaultPath: project.projectFilePath || `${projectCore.makeId(project.title)}.${PROJECT_FILE_EXTENSION}`,
          filters: [
            { name: 'ERG Viewer Project', extensions: [PROJECT_FILE_EXTENSION] },
            { name: 'Legacy ERG Viewer Project', extensions: LEGACY_PROJECT_FILE_EXTENSIONS },
          ],
        })
        if (!filePath) return
        const savedProject = await writeProjectToPath(filePath)
        setProject(savedProject)
        setStatus('Project saved for reproducible analysis')
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Save project failed')
      }
    }

    async function writeProjectToPath(filePath) {
      const savedAt = new Date().toISOString()
      const savedProject = projectCore.normalizeProject({ ...project, savedAt, projectFilePath: filePath })
      await api.writeFile(filePath, JSON.stringify(savedProject, null, 2), 'utf8')
      return savedProject
    }

    function exportSourceTable(rowsOverride) {
      const rowsToCopy = Array.isArray(rowsOverride) ? rowsOverride : sourceRows
      const header = [
        'sampleId',
        'subjectId',
        'acquisitionId',
        'sample',
        'group',
        'included',
        'mode',
        'stimulus',
        'metric',
        'version',
        'value',
      ]
      const csv = [
        header.join(','),
        ...rowsToCopy.map((row) =>
          [
            row.sampleId,
            row.subjectId,
            row.acquisitionId,
            row.sample,
            row.cohort,
            row.included,
            row.mode,
            row.condition,
            row.metric,
            row.version,
            row.value,
          ].map(csvCell).join(',')
        ),
      ].join('\n')
      if (api && api.writeClipboardText) {
        api
          .writeClipboardText(csv)
          .then(() => setStatus('Source table copied to clipboard'))
          .catch(() => setStatus('Copy failed'))
      }
    }

    async function exportProjectWorkbook() {
      if (!XLSX || !api || !exportCore) {
        setStatus('Workbook export is unavailable in this runtime')
        return
      }
      try {
        const filePath = await api.saveDialog({
          title: 'Export ERG Viewer Analysis Workbook',
          defaultPath: `${projectCore.makeId(project.title)}-analysis.xlsx`,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        })
        if (!filePath) return
        await writeWorkbookToPath(filePath, settings.activeStep === 'Report' ? reportResult : analysisResult)
        setStatus('Analysis workbook exported')
      } catch (error) {
        setStatus(error && error.message ? error.message : 'Workbook export failed')
      }
    }

    async function writeWorkbookToPath(filePath, activeResult) {
      const sheets = exportCore.buildProjectWorkbookSheets(
        projectCore.normalizeProject(project),
        activeResult,
        reportPackage
      )
      const workbook = XLSX.utils.book_new()
      Object.entries(sheets).forEach(([sheetName, rows]) => {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName.slice(0, 31))
      })
      const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      await api.writeFile(filePath, new Uint8Array(output))
      return sheets
    }

    async function exportReportPdf() {
      if (!api || !api.exportPdfFromHtml || !exportCore || !exportCore.buildReportHtml) {
        setStatus('PDF report export is unavailable in this runtime')
        return
      }
      try {
        const filePath = await api.saveDialog({
          title: 'Export ERG Viewer Report PDF',
          defaultPath: `${projectCore.makeId(project.title)}-report.pdf`,
          filters: [{ name: 'PDF Report', extensions: ['pdf'] }],
        })
        if (!filePath) return
        await writeReportPdfToPath(filePath)
        setStatus('Report PDF exported')
      } catch (error) {
        setStatus(error && error.message ? error.message : 'PDF report export failed')
      }
    }

    async function writeReportPdfToPath(filePath) {
      const html = exportCore.buildReportHtml(
        projectCore.normalizeProject(project),
        reportResult,
        reportPackage
      )
      await api.exportPdfFromHtml(html, filePath)
      return html
    }

    React.useEffect(() => {
      if (!api || !api.getQaExportDir || !api.prepareQaExportPath || qaExportStarted.current) return undefined
      if (!api.getQaExportDir()) return undefined
      if (settings.activeStep !== 'Report' && settings.activeStep !== 'Export') return undefined
      if (!reportResult || !Array.isArray(reportResult.sourceRows) || !reportResult.sourceRows.length) {
        return undefined
      }
      qaExportStarted.current = true
      let cancelled = false
      ;(async () => {
        try {
          const baseName = projectCore.makeId(project.title || 'erg-viewer-qa')
          const projectPath = await api.prepareQaExportPath(`${baseName}.${PROJECT_FILE_EXTENSION}`, [PROJECT_FILE_EXTENSION])
          const workbookPath = await api.prepareQaExportPath(`${baseName}-analysis.xlsx`, ['xlsx'])
          const pdfPath = await api.prepareQaExportPath(`${baseName}-report.pdf`, ['pdf'])
          const statusPath = await api.prepareQaExportPath(`${baseName}-qa-status.json`, ['json'])
          const savedProject = await writeProjectToPath(projectPath)
          const sheets = await writeWorkbookToPath(workbookPath, reportResult)
          await writeReportPdfToPath(pdfPath)
          await api.writeFile(
            statusPath,
            JSON.stringify(
              {
                status: 'ok',
                projectPath,
                workbookPath,
                pdfPath,
                records: savedProject.samples.length,
                sources: savedProject.sources.length,
                sourceRows: reportResult.sourceRows.length,
                sheets: Object.keys(sheets),
              },
              null,
              2
            ),
            'utf8'
          )
          if (!cancelled) {
            setStatus('QA export smoke completed')
            if (api.quit) api.quit()
          }
        } catch (error) {
          console.error('[qa] export smoke failed', error && error.message ? error.message : error)
          if (!cancelled) {
            setStatus(error && error.message ? error.message : 'QA export smoke failed')
            if (api.quit) api.quit()
          }
        }
      })()
      return () => {
        cancelled = true
      }
    }, [project, settings.activeStep, reportResult, reportPackage])

    React.useEffect(() => {
      if (!api || !api.getQaStateDir || !api.prepareQaStatePath || qaStateWritten.current) return undefined
      if (api.getQaInteractionSmoke && api.getQaInteractionSmoke() === '1') return undefined
      if (!api.getQaStateDir()) return undefined
      const expectedSources = Number(api.getQaExpectedSources ? api.getQaExpectedSources() : 0) || 0
      if (expectedSources && project.sources.length < expectedSources) return undefined
      const expectedSourceNames = api.getQaExpectedSourceNames ? api.getQaExpectedSourceNames() : ''
      if (!qaExpectedSourceNamesReady(project.sources, expectedSourceNames)) return undefined
      if (!samples.length || !project.sources.length) return undefined
      qaStateWritten.current = true
      let cancelled = false
      ;(async () => {
        try {
          await afterNextLayoutFrame()
          const activeStep = settings.activeStep || 'Review'
          const statePath = await api.prepareQaStatePath(`${projectCore.makeId(activeStep)}-state.json`)
          const payload = buildQaStateSnapshot({
            activeStep,
            project,
            selectedSample,
            visibleSamples,
            sourceRows,
            analysisResult,
            reportResult,
            reportPackage,
            canExportWorkbook,
          })
          await api.writeFile(statePath, JSON.stringify(payload, null, 2), 'utf8')
          if (!cancelled) {
            setStatus('QA state snapshot written')
            if (api.quit) api.quit()
          }
        } catch (error) {
          console.error('[qa] state snapshot failed', error && error.message ? error.message : error)
          if (!cancelled) {
            setStatus(error && error.message ? error.message : 'QA state snapshot failed')
            if (api.quit) api.quit()
          }
        }
      })()
      return () => {
        cancelled = true
      }
    }, [
      project,
      settings.activeStep,
      selectedSample,
      visibleSamples,
      sourceRows,
      analysisResult,
      reportResult,
      reportPackage,
      canExportWorkbook,
    ])

    React.useEffect(() => {
      if (!api || !api.getQaStateDir || !api.writeQaStateJson || qaInteractionStarted.current) return undefined
      if (!api.getQaStateDir || !api.getQaStateDir()) return undefined
      if (!api.getQaInteractionSmoke || api.getQaInteractionSmoke() !== '1') return undefined
      const expectedSources = Number(api.getQaExpectedSources ? api.getQaExpectedSources() : 0) || 0
      if (expectedSources && project.sources.length < expectedSources) return undefined
      if (!samples.length || !project.sources.length) return undefined
      qaInteractionStarted.current = true
      let cancelled = false
      ;(async () => {
        try {
          console.log('[qa] interaction smoke starting')
          await afterNextLayoutFrame()
          const report = await runQaInteractionSmoke()
          report.state = {
            activeStep: activeTabText(),
            records: samples.length,
            sources: project.sources.length,
            selectedSampleId: selectedSample ? selectedSample.id || '' : '',
          }
          console.log('[qa] interaction report prepared', report.status)
          const reportJson = JSON.stringify(slimQaInteractionReport(report))
          console.log('[qa] interaction report serialized', reportJson.length)
          console.log(`[qa-interaction-report]${reportJson}`)
          if (!cancelled) {
            console.log('[qa] interaction smoke completed', report.status)
            setStatus('QA interaction smoke completed')
            if (api.quit) api.quit()
          }
        } catch (error) {
          const message = error && error.message ? error.message : 'QA interaction smoke failed'
          console.error('[qa] interaction smoke failed', message)
          try {
            await api.writeQaStateJson(
              'interaction-report.json',
              JSON.stringify({ status: 'error', error: message, cases: [] }, null, 2)
            )
          } catch {}
          if (!cancelled) {
            setStatus(message)
            if (api.quit) api.quit()
          }
        }
      })()
      return () => {
        cancelled = true
      }
    }, [
      project,
      settings.activeStep,
      selectedSample,
      visibleSamples,
      sourceRows,
      analysisResult,
      reportResult,
      reportPackage,
      canExportWorkbook,
    ])

    React.useEffect(() => {
      if (!api || !api.getQaQuitSmoke || api.getQaQuitSmoke() !== '1' || qaQuitStarted.current) {
        return undefined
      }
      qaQuitStarted.current = true
      let cancelled = false
      ;(async () => {
        try {
          await afterNextLayoutFrame()
          const button = visibleElements('.toolbar-actions button').find(
            (element) => textSnippet(element.textContent) === 'Quit' && !element.disabled
          )
          if (!button) throw new Error('Quit button was not visible or enabled.')
          console.log('[qa-quit-smoke] clicking Quit')
          button.click()
        } catch (error) {
          const message = error && error.message ? error.message : 'QA quit smoke failed'
          console.error('[qa-quit-smoke] failed', message)
          if (!cancelled) setStatus(message)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [appInfo])

    function applyManualPoint(sample, side, key, point) {
      const corrections = sample.corrections || {}
      const manualPoints = manualPicks.setManualPoint(corrections.manualPoints, side, key, point)
      return { ...sample, corrections: { ...corrections, manualPoints } }
    }

    function clearManualPoint(sample, side, key) {
      const corrections = sample.corrections || {}
      const manualPoints = manualPicks.clearManualPoint(corrections.manualPoints, side, key)
      return { ...sample, corrections: { ...corrections, manualPoints } }
    }

    function nudgeManualPoint(sample, side, key, delta) {
      const corrections = sample.corrections || {}
      const manualPoints = manualPicks.nudgeManualPoint(corrections.manualPoints, side, key, delta)
      return { ...sample, corrections: { ...corrections, manualPoints } }
    }

    function renderMainStage() {
      if (settings.activeStep === 'Intake') {
        return e(IntakePanel, {
          project,
          samples,
          onRemoveSource: removeSourceFile,
          onCohortApply: (rows) =>
            setProject((current) =>
              projectCore.normalizeProject({
                ...current,
                savedAt: '',
                samples: current.samples.map((sample) => {
                  const row = (rows || []).find((item) => item.key === sourceKeyFromSample(sample))
                  if (!row) return sample
                  const alias = String(row.alias || sample.subjectId || '').trim() || sample.subjectId
	                  const cohort = String(row.cohort || '').trim() || 'Unassigned'
                  return {
                    ...sample,
                    label: `${alias} · ${sample.mode || 'Record'} ${sample.acquisitionId || ''}`.trim(),
                    subjectId: alias,
                    pairedId: alias,
                    cohort,
                    metadata: {
                      ...(sample.metadata || {}),
                      sourceAlias: alias,
                    },
                  }
                }),
              })
            ),
          selectedSample,
        onSelect: (sampleId, options) =>
          updateSettings(
            { selectedSampleId: sampleId, ...(options && options.stayIntake ? {} : { activeStep: 'Review' }) },
            { dirty: false }
          ),
        })
      }
      if (settings.activeStep === 'Analysis') {
        return e(AnalysisPanel, {
          project,
          summary: groupSummary,
          rows: sourceRows,
          result: analysisResult,
          options: analysisOptions,
          settings,
          scopeLabel: analysisResult ? analysisResult.scopeLabel || comparisonMode : comparisonMode,
          onCopy: exportSourceTable,
          onPlan: updateAnalysisPlan,
          onMode: updateAnalysisMode,
          onMetric: (metricKey) => updateSettings({ metricKey }, { dirty: true }),
          onVersion: (metricVersion) => updateSettings({ metricVersion }, { dirty: true }),
          onToggleInclude: (sampleId, included, eyeSide) => {
            const ids = Array.isArray(sampleId) ? sampleId : [sampleId]
            setProject((current) =>
              projectCore.normalizeProject({
                ...current,
                savedAt: '',
                samples: current.samples.map((sample) => {
                  if (!ids.includes(sample.id)) return sample
                  if (eyeSide === 'right' || eyeSide === 'left') {
                    const excludedEyes = { ...((sample.corrections && sample.corrections.excludedEyes) || {}) }
                    excludedEyes[eyeSide] = included === false
                    return {
                      ...sample,
                      corrections: {
                        ...(sample.corrections || {}),
                        excludedEyes,
                      },
                    }
                  }
                  return { ...sample, included: typeof included === 'boolean' ? included : sample.included === false }
                }),
              })
            )
          },
        })
      }
      if (settings.activeStep === 'Report' || settings.activeStep === 'Export') {
        return e(ExportPanel, {
          project,
          report: reportPackage,
          result: reportResult,
          summary: reportSummary,
          settings,
          scopeLabel: reportResult ? reportResult.scopeLabel || comparisonMode : comparisonMode,
          reportScope,
          onReportScope: updateReportScope,
          onSave: saveProject,
          onExport: exportProjectWorkbook,
          onExportPdf: exportReportPdf,
          onCopy: () => exportSourceTable(reportResult && reportResult.sourceRows),
        })
      }
      return e(ReviewPanel, {
        project,
        sample: selectedSample,
        onReviewScope: updateReviewScope,
        onManualPick: (side, key, point) =>
          selectedSample &&
          updateSample(selectedSample.id, (sample) => applyManualPoint(sample, side, key, point)),
        onClearManualPoint: (side, key) =>
          selectedSample && updateSample(selectedSample.id, (sample) => clearManualPoint(sample, side, key)),
        onNudgeManualPoint: (side, key, delta) =>
          selectedSample &&
          updateSample(selectedSample.id, (sample) => nudgeManualPoint(sample, side, key, delta)),
      })
    }

    const isReviewStep = settings.activeStep === 'Review'

    return e(
      'div',
      { className: 'app-shell' },
      e(Topbar, {
        settings,
        appInfo,
        statusMessage,
        onStep: (step) => updateSettings({ activeStep: step }),
        onDemo: () => {
          setProject(projectCore.normalizeProject(demo.createDemoProject()))
          setStatus('Demo project reloaded')
        },
        onImport: chooseExcel,
        onOpen: openProject,
        onSave: saveProject,
        onQuit: () => api && api.quit && api.quit(),
      }),
      e(
        'div',
        { className: `workspace ${isReviewStep ? 'review-workspace' : 'workflow-workspace'}` },
        e(
          'main',
          { className: `main-stage ${settings.activeStep === 'Review' ? 'review-stage' : 'single'}` },
          renderMainStage()
        ),
        isReviewStep
          ? e(Inspector, {
              sample: selectedSample,
              onSamplePatch: (patch) =>
                selectedSample &&
                updateSample(selectedSample.id, (sample) => ({
                  ...sample,
                  ...patch,
                })),
            })
          : null
      )
    )
  }

  function Topbar({
    settings,
    appInfo,
    statusMessage,
    onStep,
    onDemo,
    onImport,
    onOpen,
    onSave,
    onQuit,
  }) {
    const activeStep = settings.activeStep === 'Export' ? 'Report' : settings.activeStep
    return e(
      'header',
      { className: 'topbar' },
      e(
        'div',
        { className: 'window-brand' },
        e(
          'div',
          { className: 'brand' },
          e('div', { className: 'brand-mark' }, 'E'),
          e(
            'div',
            null,
            e('div', { className: 'brand-title' }, 'ERG Viewer v2'),
            e(
              'div',
              { className: 'brand-subtitle' },
              statusMessage || (appInfo ? `Project workstation ${appInfo.version}` : 'Retinal electrophysiology workstation')
            )
          )
        )
      ),
      e(
        'nav',
        { className: 'tabs' },
        STEPS.map((step) =>
          e(
            'button',
            {
              key: step,
              className: `tab ${activeStep === step ? 'active' : ''}`,
              onClick: () => onStep(step),
            },
            step
          )
        )
      ),
      e(
        'div',
        { className: 'toolbar-actions' },
        e('button', { className: 'primary', onClick: onImport }, 'Import Excel'),
        e('button', { onClick: onOpen }, 'Open Project'),
        e('button', { onClick: onSave }, 'Save Project'),
        e('button', { className: 'toolbar-trailing-start', onClick: onDemo }, 'Demo'),
        e(
          'button',
          {
            className: 'quit-action',
            title: 'Quit ERG Viewer completely.',
            'aria-label': 'Quit ERG Viewer completely',
            onClick: onQuit,
          },
          'Quit'
        )
      )
    )
  }

  function Stat({ label, value }) {
    return e(
      'div',
      { className: 'stat' },
      e('div', { className: 'stat-label' }, label),
      e('div', { className: 'stat-value' }, value)
    )
  }

  function ReviewPanel({
    project,
    sample,
    onReviewScope,
    onManualPick,
    onClearManualPoint,
    onNudgeManualPoint,
  }) {
    const [activePick, setActivePick] = React.useState(null)
    const [lastPicked, setLastPicked] = React.useState(null)
    const [plotYMode, setPlotYMode] = React.useState('auto')
    const [plotResetToken, setPlotResetToken] = React.useState(0)
    React.useEffect(() => setActivePick(null), [sample && sample.id])
    const raw = sample && sample.metrics ? sample.metrics.raw : {}
    const corrected = sample
      ? metrics.correctedMetrics(raw, { ...sample.corrections, mode: sample.mode })
      : {}
    const pickTargets = sample ? manualTargetsForMode(sample.mode) : []
    const reviewScope = buildReviewScope(project && project.samples, sample)
    const sharedYRange = sharedWaveformYRange(sample, plotYMode)
    const qaManualPick = api && api.getQaManualPick ? api.getQaManualPick() : ''
    const qaActivePick = parseQaManualPickPreset(qaManualPick, pickTargets)
    const manualPoints = sample
      ? manualPicks.cloneManualPoints(sample.corrections && sample.corrections.manualPoints)
      : null
    const selectedPoint =
      activePick && manualPoints
        ? manualPicks.getManualPoint(manualPoints, activePick.side, activePick.key)
        : null
    function handlePick(side, point) {
      if (!activePick || activePick.side !== side) return
      onManualPick(side, activePick.key, point)
      setLastPicked({ ...activePick, point })
    }
    function activatePick(side, target) {
      setActivePick({ side, key: target.key, label: target.label })
    }
    function clearActivePick() {
      if (!activePick) return
      onClearManualPoint(activePick.side, activePick.key)
      setLastPicked(null)
    }
    function nudgeActivePick(delta) {
      if (!activePick || !selectedPoint) return
      onNudgeManualPoint(activePick.side, activePick.key, delta)
    }
    React.useEffect(() => {
      if (!qaActivePick) return
      setActivePick(qaActivePick)
    }, [sample && sample.id, qaActivePick && qaActivePick.side, qaActivePick && qaActivePick.key])
    React.useEffect(() => {
      function onKeyDown(event) {
        if (!activePick) return
        if (event.key === 'Escape') {
          event.preventDefault()
          setActivePick(null)
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          setActivePick(null)
          return
        }
        if (!selectedPoint) return
        const fine = event.shiftKey ? 0.1 : 1
        const amp = event.shiftKey ? 0.25 : 2.5
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          nudgeActivePick({ x: -fine, y: 0 })
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          nudgeActivePick({ x: fine, y: 0 })
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          nudgeActivePick({ x: 0, y: amp })
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          nudgeActivePick({ x: 0, y: -amp })
        }
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }, [
      activePick && activePick.side,
      activePick && activePick.key,
      selectedPoint && selectedPoint.x,
      selectedPoint && selectedPoint.y,
    ])
    return e(
      'section',
      { className: 'panel review-panel' },
      e(
        'div',
        { className: 'review-controls' },
        e(ReviewScopeSelect, {
          label: 'Type',
          value: reviewScope.type,
          options: reviewScope.types,
          onChange: (value) => onReviewScope && onReviewScope({ type: value }),
        }),
        e(ReviewScopeSelect, {
          label: 'Name',
          value: reviewScope.name,
          options: reviewScope.names,
          onChange: (value) => onReviewScope && onReviewScope({ name: value }),
        }),
        e(ReviewScopeSelect, {
          label: 'Mode',
          value: reviewScope.categoryKey,
          options: reviewScope.categories.map((item) => item.key),
          labels: Object.fromEntries(reviewScope.categories.map((item) => [item.key, item.label])),
          onChange: (value) => onReviewScope && onReviewScope({ categoryKey: value }),
        }),
        e(ReviewScopeSelect, {
          label: 'Stimulus',
          value: reviewScope.condition,
          options: reviewScope.conditions.map((item) => item.condition),
          labels: Object.fromEntries(reviewScope.conditions.map((item) => [item.condition, item.label])),
          onChange: (value) => onReviewScope && onReviewScope({ condition: value }),
        }),
        e(
          'div',
          { className: 'review-plot-actions' },
          e(
            'button',
            {
              className: plotYMode === 'auto' ? 'active' : '',
              onClick: () => setPlotYMode('auto'),
            },
            'Y Auto'
          ),
          e(
            'button',
            {
              className: plotYMode === 'symmetric' ? 'active' : '',
              onClick: () => setPlotYMode('symmetric'),
            },
            'Y +/-'
          ),
          e('button', { onClick: () => setPlotResetToken((value) => value + 1) }, 'Reset zoom')
        )
      ),
      e(
        'div',
        { className: 'review-body' },
        e(
          'div',
          { className: 'plot-grid' },
          e(WaveformPlot, {
            key: `${sample ? sample.id : 'none'}-right-${sample && sample.included === false ? 'out' : 'in'}`,
            title: 'Right eye (OD)',
            trace: sample && sample.traces.right,
            color: '#2563eb',
            side: 'right',
            manualPoints: manualPoints && manualPoints.right,
            activePick,
            yRange: sharedYRange,
            resetToken: plotResetToken,
            onMarkerSelect: (targetKey) => {
              const target = pickTargets.find((item) => item.key === targetKey)
              if (target) activatePick('right', target)
            },
            onPick: handlePick,
          }),
          e(WaveformPlot, {
            key: `${sample ? sample.id : 'none'}-left-${sample && sample.included === false ? 'out' : 'in'}`,
            title: 'Left eye (OS)',
            trace: sample && sample.traces.left,
            color: '#0f766e',
            side: 'left',
            manualPoints: manualPoints && manualPoints.left,
            activePick,
            yRange: sharedYRange,
            resetToken: plotResetToken,
            onMarkerSelect: (targetKey) => {
              const target = pickTargets.find((item) => item.key === targetKey)
              if (target) activatePick('left', target)
            },
            onPick: handlePick,
          })
        ),
        e(ManualPickPanel, {
          sample,
          raw,
          corrected,
          pickTargets,
          activePick,
          selectedPoint,
          lastPicked,
          manualPoints,
          onArm: activatePick,
          onCancel: () => setActivePick(null),
          onClear: clearActivePick,
          onNudge: nudgeActivePick,
        })
      )
    )
  }

  function ReviewScopeSelect({ label, value, options, labels, disabled, onChange }) {
    const optionList = Array.isArray(options) && options.length ? options : [value || label]
    const normalized = optionList.includes(value) ? value : optionList[0]
    return e(
      'label',
      { className: `review-select review-select-${String(label || '').toLowerCase()}` },
      e('span', null, label),
      e(
        'select',
        {
          value: normalized || '',
          disabled: !!disabled || !optionList.length,
          onChange: (event) => onChange && onChange(event.target.value),
        },
        optionList.map((option) =>
          e('option', { key: option || label, value: option || '' }, (labels && labels[option]) || option || label)
        )
      )
    )
  }

  function buildReviewScope(samples, sample) {
    const allSamples = Array.isArray(samples) ? samples : []
    const fallback = sample || allSamples[0] || null
    const type = fallback ? recordSourceType(fallback) : 'ERG'
    const typeRows = allSamples.filter((row) => recordSourceType(row) === type)
    const name = fallback ? reviewSampleName(fallback) : ''
    const category = fallback ? acquisitionCategory(fallback) : { key: '', label: 'Mode' }
    const names = sourceCohortRows(typeRows, []).map((row) => row.alias).filter(Boolean)
    const categoryRows = typeRows.filter(
      (row) =>
        (!name || reviewSampleName(row) === name)
    )
    const categories = acquisitionCategoryOptions(categoryRows.length ? categoryRows : typeRows)
    const conditionRows = (categoryRows.length ? categoryRows : typeRows).filter(
      (row) => acquisitionCategory(row).key === category.key
    )
    const conditions = uniqueConditionOptions(conditionRows.length ? conditionRows : categoryRows)
    return {
      type,
      types: availableRecordFilters(allSamples),
      name: names.includes(name) ? name : names[0] || '',
      names,
      categoryKey: categories.some((item) => item.key === category.key)
        ? category.key
        : categories[0] && categories[0].key,
      categories,
      condition: conditions.some((item) => item.condition === (fallback && fallback.condition))
        ? fallback.condition
        : conditions[0] && conditions[0].condition,
      conditions,
    }
  }

  function selectReviewSample(samples, currentSample, patch) {
    const allSamples = Array.isArray(samples) ? samples : []
    if (!allSamples.length) return null
    const current = currentSample || allSamples[0]
    const currentCategory = acquisitionCategory(current)
    const target = {
      type: patch.type || recordSourceType(current),
      name: Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : reviewSampleName(current),
      categoryKey: Object.prototype.hasOwnProperty.call(patch, 'categoryKey') ? patch.categoryKey : currentCategory.key,
      condition: Object.prototype.hasOwnProperty.call(patch, 'condition') ? patch.condition : current.condition,
    }
    let candidates = allSamples.filter((sample) => recordSourceType(sample) === target.type)
    if (target.name) {
      const named = candidates.filter((sample) => reviewSampleName(sample) === target.name)
      if (named.length) candidates = named
    }
    if (target.categoryKey) {
      const categorized = candidates.filter((sample) => acquisitionCategory(sample).key === target.categoryKey)
      if (categorized.length) candidates = categorized
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'condition') && target.condition) {
      const conditioned = candidates.filter((sample) => sample.condition === target.condition)
      if (conditioned.length) candidates = conditioned
    }
    return sortSamplesByStimulus(candidates)[0] || current || allSamples[0]
  }

  function firstSampleForAnalysisCategory(samples, sourceType, categoryKey) {
    const rows = (Array.isArray(samples) ? samples : []).filter((sample) => recordSourceType(sample) === sourceType)
    const matched = categoryKey
      ? rows.filter((sample) => acquisitionCategory(sample).key === categoryKey)
      : rows
    return sortSamplesByStimulus(matched.length ? matched : rows)[0] || null
  }

  function analysisModeOptions(samples, sourceType) {
    return acquisitionCategoryOptions(
      (Array.isArray(samples) ? samples : []).filter((sample) => recordSourceType(sample) === sourceType)
    )
  }

  function analysisCategoryKeyFromPlan(samples, plan) {
    const rows = Array.isArray(samples) ? samples : []
    const matched = rows.find((sample) => {
      if (plan.sourceType !== 'All' && recordSourceType(sample) !== plan.sourceType) return false
      if (plan.protocolMode !== 'All' && sample.mode !== plan.protocolMode) return false
      const family = parseConditionLabel(sample.condition).protocolFamily || 'All'
      if (plan.protocolFamily !== 'All' && family !== plan.protocolFamily) return false
      return true
    })
    return matched ? acquisitionCategory(matched).key : ''
  }

  function representativeSample(samples, plan, group) {
    const activePlan = plan || {}
    const rows = (Array.isArray(samples) ? samples : []).filter((sample) => {
      if (sample.included === false) return false
      if (group && group !== 'All' && sample.cohort !== group) return false
      if (activePlan.sourceType && activePlan.sourceType !== 'All' && recordSourceType(sample) !== activePlan.sourceType) return false
      if (activePlan.protocolMode && activePlan.protocolMode !== 'All' && sample.mode !== activePlan.protocolMode) return false
      const family = parseConditionLabel(sample.condition).protocolFamily || 'All'
      if (activePlan.protocolFamily && activePlan.protocolFamily !== 'All' && family !== activePlan.protocolFamily) return false
      return hasTrace(sample && sample.traces && sample.traces.right) || hasTrace(sample && sample.traces && sample.traces.left)
    })
    return sortSamplesByStimulus(rows)[0] || null
  }

  function representativeTrace(sample, eye) {
    if (!sample || !sample.traces) return null
    if (eye === 'left') return hasTrace(sample.traces.left) ? sample.traces.left : null
    if (eye !== 'average') return hasTrace(sample.traces.right) ? sample.traces.right : null
    const right = sample.traces.right
    const left = sample.traces.left
    if (!hasTrace(right) && !hasTrace(left)) return null
    if (!hasTrace(right)) return left
    if (!hasTrace(left)) return right
    const length = Math.min(right.y.length, left.y.length)
    return {
      x: right.x.slice(0, length),
      y: right.y.slice(0, length).map((value, index) => (Number(value) + Number(left.y[index])) / 2),
    }
  }

  function hasTrace(trace) {
    return !!(trace && Array.isArray(trace.x) && Array.isArray(trace.y) && trace.x.length && trace.y.length)
  }

  function reviewSampleName(sample) {
    const metadata = sample && sample.metadata ? sample.metadata : {}
    return String(metadata.sourceAlias || sourceAliasFromFilename(metadata.sourcePath || sample?.sourceName || sample?.subjectId || '')).trim()
  }

  function reviewSourceFilename(sample) {
    const metadata = sample && sample.metadata ? sample.metadata : {}
    return fileNameFromPath(metadata.sourcePath || sample?.sourceName || 'Demo')
  }

  function uniqueConditionOptions(samples) {
    const seen = new Map()
    sortSamplesByStimulus(samples).forEach((sample) => {
      if (!sample || !sample.condition || seen.has(sample.condition)) return
      seen.set(sample.condition, {
        condition: sample.condition,
        label: displayConditionLabel(sample),
      })
    })
    return Array.from(seen.values())
  }

  function sortSamplesByStimulus(samples) {
    return [...(samples || [])].sort((left, right) => {
      const leftMeta = parseConditionLabel(left && left.condition)
      const rightMeta = parseConditionLabel(right && right.condition)
      if (Number.isFinite(leftMeta.stimulusValue) && Number.isFinite(rightMeta.stimulusValue)) {
        return leftMeta.stimulusValue - rightMeta.stimulusValue
      }
      return String(left && left.condition).localeCompare(String(right && right.condition))
    })
  }

  function sharedWaveformYRange(sample, mode) {
    const traces = sample && sample.traces ? [sample.traces.right, sample.traces.left] : []
    const values = traces
      .flatMap((trace) => (trace && Array.isArray(trace.y) ? trace.y : []))
      .map(Number)
      .filter(Number.isFinite)
    if (!values.length) return null
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (mode === 'symmetric') {
      const amplitude = Math.max(Math.abs(min), Math.abs(max), 1)
      const pad = Math.max(5, amplitude * 0.08)
      return [-(amplitude + pad), amplitude + pad]
    }
    const span = Math.max(max - min, 1)
    const pad = Math.max(5, span * 0.08)
    return [min - pad, max + pad]
  }

  function WaveformPlot({
    title,
    trace,
    color,
    side,
    manualPoints,
    activePick,
    yRange,
    resetToken,
    onPick,
    onMarkerSelect,
  }) {
    const ref = React.useRef(null)
    const hasTrace = trace && Array.isArray(trace.y) && trace.y.length
    React.useEffect(() => {
      if (!Plotly || !ref.current) return
      const markers = manualPicks.manualMarkers(manualPoints)
      const data = hasTrace
        ? [
            {
              x: trace.x,
              y: trace.y,
              type: 'scatter',
              mode: 'lines',
              line: { color, width: 2 },
              hovertemplate: '%{x:.1f} ms<br>%{y:.2f} µV<extra></extra>',
            },
            {
              x: markers.map((point) => point.x),
              y: markers.map((point) => point.y),
              text: markers.map((point) => point.label),
              customdata: markers.map((point) => point.key),
              type: 'scatter',
              mode: 'markers+text',
              textposition: 'top center',
              marker: { size: 9, color: '#b45309', line: { color: '#ffffff', width: 1.5 } },
              hovertemplate: '%{text}<br>%{x:.1f} ms<br>%{y:.2f} µV<extra></extra>',
              showlegend: false,
            },
          ]
        : []
      try {
        Plotly.purge && Plotly.purge(ref.current)
      } catch {}
      Plotly.newPlot(
        ref.current,
        data,
        {
          autosize: true,
          margin: { l: 62, r: 14, t: 12, b: 66 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: '#ffffff',
          xaxis: hasTrace
            ? {
                title: { text: '' },
                gridcolor: '#e6ebf1',
                zerolinecolor: '#cbd5e1',
                ticks: 'outside',
                ticklen: 5,
                tickcolor: '#cbd5e1',
                tickfont: { size: 10, color: '#475569' },
                automargin: true,
                fixedrange: false,
              }
            : { visible: false, showgrid: false, zeroline: false },
          yaxis: hasTrace
            ? {
                title: { text: 'Amp (µV)', standoff: 18, font: { size: 10, color: '#64748b' } },
                gridcolor: '#e6ebf1',
                zerolinecolor: '#cbd5e1',
                ticks: 'outside',
                ticklen: 5,
                tickcolor: '#cbd5e1',
                tickfont: { size: 10, color: '#475569' },
                automargin: false,
                fixedrange: false,
                ...(Array.isArray(yRange) ? { range: yRange } : { autorange: true }),
              }
            : { visible: false, showgrid: false, zeroline: false },
          showlegend: false,
          hovermode: 'closest',
          clickmode: 'event+select',
          dragmode: 'zoom',
          displayModeBar: false,
          font: {
            family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
            size: 10,
            color: '#475569',
          },
        },
        { responsive: true, displayModeBar: false, scrollZoom: true, doubleClick: 'reset', displaylogo: false }
      )
      const div = ref.current
      const resizePlot = () => {
        if (!div || !div.isConnected || !div.clientWidth || !div.clientHeight) return
        try {
          const resize = Plotly.Plots && Plotly.Plots.resize(div)
          if (resize && typeof resize.catch === 'function') resize.catch(() => {})
        } catch {}
      }
      const frame = requestAnimationFrame(resizePlot)
      const observer =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => requestAnimationFrame(resizePlot))
          : null
      observer && observer.observe(div)
      function onClick(event) {
        if (!event || !event.points || !event.points.length) return
        const point = event.points[0]
        if (point.data && point.data.customdata && point.data.customdata[point.pointNumber]) {
          onMarkerSelect && onMarkerSelect(point.data.customdata[point.pointNumber])
          return
        }
        if (!activePick || activePick.side !== side) return
        onPick(side, { x: Number(point.x), y: Number(point.y) })
      }
      div.on && div.on('plotly_click', onClick)
      return () => {
        cancelAnimationFrame(frame)
        observer && observer.disconnect()
        try {
          div.removeAllListeners && div.removeAllListeners('plotly_click')
        } catch {}
        try {
          Plotly.purge && Plotly.purge(div)
        } catch {}
      }
    }, [
      trace,
      color,
      side,
      JSON.stringify(manualPoints || {}),
      onMarkerSelect,
      activePick && activePick.side,
      activePick && activePick.key,
      JSON.stringify(yRange || []),
      resetToken,
      hasTrace,
    ])
    return e(
      'div',
      { className: `plot-card ${activePick && activePick.side === side ? 'picking' : ''}` },
      e(
        'div',
        { className: 'plot-title' },
        e('span', null, title),
        e(
          'span',
          null,
          activePick && activePick.side === side
            ? `Picking ${activePick.label}`
            : hasTrace
              ? `${trace.y.length} points`
              : 'No trace'
        )
      ),
      e(
        'div',
        { className: 'plot-shell' },
        e('div', { className: 'plot', ref }),
        hasTrace && e('div', { className: 'plot-x-title' }, 'Time (ms)'),
        !hasTrace &&
          e('div', { className: 'plot-empty-state' }, `${title.replace(/ trace$/i, '')} unavailable`)
      )
    )
  }

	  function ManualPickPanel({
    sample,
    raw,
    pickTargets,
    activePick,
    selectedPoint,
    lastPicked,
    manualPoints,
    onArm,
    onCancel,
	    onClear,
	  }) {
    const [pickSide, setPickSide] = React.useState('right')
    React.useEffect(() => {
      if (!activePick || (activePick.side !== 'right' && activePick.side !== 'left')) return
      setPickSide(activePick.side)
    }, [activePick && activePick.side])
	    if (!sample)
	      return e('div', { className: 'manual-strip empty' }, 'Select a record to review manual points.')
	    const pointCount = manualPicks.countManualPoints(manualPoints)
	    const workflowHint = manualWorkflowHint(sample.mode, pointCount)
	    function sideTabs(selectedSide, onSelect) {
	      return e(
	        'div',
	        { className: 'eye-tabs', role: 'tablist', 'aria-label': 'Eye selector' },
	        ['right', 'left'].map((side) =>
	          e(
	            'button',
	            {
	              key: side,
	              className: selectedSide === side ? 'active' : '',
	              role: 'tab',
	              'aria-selected': selectedSide === side ? 'true' : 'false',
	              onClick: () => onSelect(side),
	            },
	            side === 'right' ? 'OD' : 'OS'
	          )
	        )
	      )
	    }
	    function manualPickControl() {
	      const side = pickSide === 'left' ? 'left' : 'right'
	      const sideTrace = sample.traces && sample.traces[side]
	      const sideHasTrace = sideTrace && Array.isArray(sideTrace.y) && sideTrace.y.length
	      return e(
	        'div',
	        { className: sideHasTrace ? 'manual-pick-panel' : 'manual-pick-panel missing-trace' },
	        e(
	          'div',
	          { className: 'manual-panel-head' },
	          e('span', null, 'Eye manual picks'),
	          sideTabs(side, setPickSide)
	        ),
	        e(
	          'div',
	          { className: 'manual-buttons' },
	          pickTargets.map((target) =>
	            e(
	              'button',
	              {
	                key: `${side}-${target.key}`,
	                className:
	                  activePick && activePick.side === side && activePick.key === target.key
	                    ? 'active-pick'
	                    : '',
	                disabled: !sideHasTrace,
	                title: sideHasTrace ? `Pick ${target.label}` : 'No trace is available for this eye.',
	                'aria-label': sideHasTrace
	                  ? `Pick ${target.label} on ${side} eye`
	                  : `Cannot pick ${target.label}; no trace is available for ${side} eye`,
                onClick: () => {
                  if (!sideHasTrace) return
                  onArm(side, target)
                },
	              },
	              target.label
	            )
	          )
	        ),
	        manualPointHint(side)
	      )
    }
    function manualPointPanel() {
      const isActive = Boolean(activePick)
      const selectedLabel = activePick ? activePick.label : 'No point selected'
      return e(
        'div',
        { className: isActive ? 'manual-point-panel active' : 'manual-point-panel idle' },
        e(
          'div',
          { className: 'manual-point-head' },
          e('span', null, 'Manual point'),
          e(
            'div',
            { className: 'manual-point-toolbar' },
            e(
              'div',
              { className: 'manual-actions' },
              e(
                'button',
                {
                  disabled: !isActive || !selectedPoint,
                  title: isActive && selectedPoint ? 'Clear the selected manual point.' : 'Pick a manual point before clearing.',
                  'aria-label': isActive && selectedPoint ? 'Clear selected manual point' : 'Clear point disabled until a manual point is picked',
                  onClick: onClear,
                },
                'Clear'
              ),
              e(
                'button',
                {
                  disabled: !isActive,
                  title: isActive ? 'Finish manual point selection.' : 'Choose a manual point before finishing.',
                  'aria-label': isActive ? 'Finish manual point selection' : 'Done disabled until a manual point is active',
                  onClick: onCancel,
                },
                'Done'
              )
            )
          )
        ),
        e(
          'div',
          { className: 'manual-point-sections', 'aria-label': `Manual point ${selectedLabel}` },
          manualPointSideBlock('right'),
          manualPointSideBlock('left')
        )
      )
    }
    function manualPointSideBlock(side) {
      const isActiveSide = Boolean(activePick && activePick.side === side)
      const key = activePick && activePick.key
      const rawPoint = key ? inferredRawPointForTarget(sample, side, key, raw) : null
      const manualPoint =
        key && manualPoints
          ? manualPicks.getManualPoint(manualPoints, side, key)
          : null
      return e(
        'div',
        { className: isActiveSide ? 'manual-point-side active' : 'manual-point-side', key: side },
        e('div', { className: 'manual-point-side-title' }, side === 'right' ? 'OD' : 'OS'),
        e(
          'div',
          { className: 'manual-point-table' },
          e(
            'div',
            { className: 'manual-point-row manual-point-row-head' },
            e('span', null, 'Layer'),
            e('span', null, 'Time (ms)'),
            e('span', null, 'Amp (µV)')
          ),
          manualPointRow('Raw', rawPoint),
          manualPointRow('Manual', manualPoint)
        )
      )
    }
    function manualPointRow(layer, point) {
      return e(
        'div',
        { className: 'manual-point-row' },
        e('span', null, layer),
        e('span', null, point && Number.isFinite(Number(point.x)) ? formatPointValue(point.x) : 'NA'),
        e('span', null, point && Number.isFinite(Number(point.y)) ? formatPointValue(point.y) : 'NA')
      )
    }
    function manualPointHint(side) {
      const sideCount = manualSidePointCount(manualPoints, side)
      const sideLastPicked = lastPicked && lastPicked.side === side ? lastPicked : null
      return e(
        'div',
        { className: 'manual-hint' },
        e(
          'span',
          { className: 'manual-hint-count' },
          sideLastPicked
            ? `Last: ${sideLastPicked.label}`
            : `${sideCount} point${sideCount === 1 ? '' : 's'} recorded`
        ),
        e('span', { className: 'manual-hint-rule' }, workflowHint)
      )
    }
	    return e(
	      'div',
	      { className: 'manual-strip' },
	      manualPickControl(),
	      manualPointPanel()
	    )
	  }

  function inferredRawPointForTarget(sample, side, key, raw) {
    if (!sample || !key) return null
    const normalized = String(key).toLowerCase()
    const suffix =
      normalized === 'a'
        ? 'a'
        : normalized === 'b'
          ? 'b'
          : normalized.match(/^(n1|p1|n2|p2)$/)
            ? normalized
            : null
    if (suffix) {
      const latency = raw && raw[`${suffix}LatencyMs`]
      const amplitude = raw && raw[`${suffix}AmplitudeUv`]
      if (Number.isFinite(Number(latency)) || Number.isFinite(Number(amplitude))) {
        return { x: latency, y: amplitude }
      }
    }
    const trace = sample.traces && sample.traces[side]
    if (!trace || !Array.isArray(trace.x) || !Array.isArray(trace.y) || !trace.y.length) return null
    const findPoint = normalized.includes('valley') || normalized.includes('trough') || normalized === 'a'
      ? trace.y.reduce((best, value, index) => (Number(value) < Number(trace.y[best]) ? index : best), 0)
      : trace.y.reduce((best, value, index) => (Number(value) > Number(trace.y[best]) ? index : best), 0)
    return { x: trace.x[findPoint], y: trace.y[findPoint] }
  }

  function manualSidePointCount(manualPoints, side) {
    const points = manualPoints && manualPoints[side] ? manualPoints[side] : {}
    return Object.values(points).filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))).length
  }

  function manualWorkflowHint(mode, pointCount) {
    const normalized = String(mode || '').toLowerCase()
    if (normalized === 'dops') {
      return pointCount
        ? 'Corrected OP amp updates from complete peak-valley pairs.'
        : 'Pick OP peak and valley pairs.'
    }
    if (normalized === 'fvep') {
      return pointCount
        ? 'Corrected latency and amp use picked N/P points.'
        : 'Pick N/P response points.'
    }
    return pointCount
      ? 'Corrected a/b metrics use picked a-wave and b-wave points.'
      : 'Pick a-wave and b-wave points.'
  }

  function IntakePanel({
    project,
    samples,
    onRemoveSource,
    onCohortApply,
    selectedSample,
    onSelect,
  }) {
    const [activeSourceKey, setActiveSourceKey] = React.useState('')
    const [activeAcquisitionCategory, setActiveAcquisitionCategory] = React.useState('')
    const [cohortDrafts, setCohortDrafts] = React.useState({})
    const allSamples = project.samples || samples || []
    const included = allSamples.filter((sample) => sample.included !== false).length
    const cohorts = new Set(allSamples.map((sample) => sample.cohort || 'Unassigned')).size
    const cohortRows = sourceCohortRows(allSamples, project.sources || [])
    const cohortDraftKey = cohortRows.map((row) => `${row.key}:${row.alias}:${row.cohort}`).join('|')
    React.useEffect(() => {
      setCohortDrafts((current) =>
        cohortRows.reduce((drafts, row) => {
          const previous = current[row.key] || {}
          drafts[row.key] = {
            alias: previous.alias == null ? row.alias : previous.alias,
            cohort: previous.cohort == null ? row.cohort : previous.cohort,
          }
          return drafts
        }, {})
      )
    }, [cohortDraftKey])
    const cohortDraftRows = cohortRows.map((row) => ({
      ...row,
      alias: cohortDrafts[row.key] && cohortDrafts[row.key].alias != null ? cohortDrafts[row.key].alias : row.alias,
      cohort:
        cohortDrafts[row.key] && cohortDrafts[row.key].cohort != null ? cohortDrafts[row.key].cohort : row.cohort,
    }))
    const cohortDraftChanged = cohortDraftRows.some(
      (row) => row.alias !== row.originalAlias || row.cohort !== row.originalCohort
    )
    const selectedSampleSourceKey = selectedSample ? sourceKeyFromSample(selectedSample) : ''
    const selectedSampleCategory = selectedSample ? acquisitionCategory(selectedSample).key : ''
    React.useEffect(() => {
      if (selectedSampleSourceKey && selectedSampleSourceKey !== activeSourceKey) {
        setActiveSourceKey(selectedSampleSourceKey)
      }
      if (selectedSampleCategory && selectedSampleCategory !== activeAcquisitionCategory) {
        setActiveAcquisitionCategory(selectedSampleCategory)
      }
    }, [selectedSample && selectedSample.id])
    const selectedSourceKey = cohortDraftRows.some((row) => row.key === (activeSourceKey || selectedSampleSourceKey))
      ? activeSourceKey || selectedSampleSourceKey
      : cohortDraftRows[0] && cohortDraftRows[0].key
    const activeSource = cohortDraftRows.find((row) => row.key === selectedSourceKey) || null
    const sourceRows = selectedSourceKey
      ? allSamples.filter((sample) => sourceKeyFromSample(sample) === selectedSourceKey)
      : []
    const categoryOptions = acquisitionCategoryOptions(sourceRows)
    const activeCategory = categoryOptions.some((item) => item.key === activeAcquisitionCategory)
      ? activeAcquisitionCategory
      : categoryOptions[0] && categoryOptions[0].key
    const acquisitionRows = activeCategory
      ? sourceRows.filter((sample) => acquisitionCategory(sample).key === activeCategory)
      : sourceRows
    function selectSource(sourceKey) {
      setActiveSourceKey(sourceKey)
      const rows = sortSamplesByStimulus(allSamples.filter((sample) => sourceKeyFromSample(sample) === sourceKey))
      const preferred =
        rows.find((sample) => activeCategory && acquisitionCategory(sample).key === activeCategory) || rows[0]
      if (preferred) {
        setActiveAcquisitionCategory(acquisitionCategory(preferred).key)
        onSelect && onSelect(preferred.id, { stayIntake: true })
      }
    }
    function selectCategory(categoryKey) {
      setActiveAcquisitionCategory(categoryKey)
      const preferred = sortSamplesByStimulus(sourceRows).find((sample) => acquisitionCategory(sample).key === categoryKey)
      if (preferred) onSelect && onSelect(preferred.id, { stayIntake: true })
    }
    const acquisitionRecordsPanel = e(
      'div',
      { className: 'panel intake-record-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title' }, 'Acquisition'),
        activeSource ? e('span', { className: 'pill' }, activeSource.filename) : null
      ),
      e(
        'div',
        { className: 'acquisition-switch-row' },
        categoryOptions.map((item) =>
          e(
            'button',
            {
              key: item.key,
              className: `filter-chip ${activeCategory === item.key ? 'active' : ''}`,
              title: item.label,
              onClick: () => selectCategory(item.key),
            },
            item.label
          )
        )
      ),
      e(
        'div',
        { className: 'sample-list acquisition-record-list' },
        acquisitionRows.length
          ? [
              e(
                'div',
                { key: 'acquisition-head', className: 'acquisition-record-row acquisition-record-head' },
                e('span', null, 'Filename'),
                e('span', null, 'No.'),
                e('span', null, 'Mode'),
                e('span', null, 'Stimulus'),
                e('span', null, 'Eye')
              ),
              ...acquisitionRows.map((sample) =>
                e(
                  'div',
                  {
                    key: sample.id,
                    className: `acquisition-record-row ${selectedSample && selectedSample.id === sample.id ? 'active' : ''}`,
                  },
                  e(
                    'div',
                    {
                      className: 'acquisition-select-action acquisition-file-cell',
                      role: 'button',
                      tabIndex: 0,
                      title: acquisitionFilename(sample),
                      onClick: () => onSelect && onSelect(sample.id),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSelect && onSelect(sample.id)
                        }
                      },
                    },
                    acquisitionFilename(sample)
                  ),
                  e('span', { className: 'acquisition-no-cell', title: acquisitionNumberLabel(sample) }, acquisitionNumberLabel(sample)),
                  e('span', { className: 'acquisition-mode-cell', title: recordProtocolLabel(sample) }, recordProtocolLabel(sample)),
                  e('span', { className: 'acquisition-condition-cell', title: displayConditionLabel(sample) }, displayConditionLabel(sample)),
                  e('span', { className: 'acquisition-eye-cell', title: sampleEyeLabel(sample) }, sampleEyeLabel(sample))
                )
              ),
            ]
          : e('div', { className: 'empty' }, 'Select a source file before reviewing records.')
      )
    )
    return e(
      'section',
      { className: 'intake-grid' },
      e(
        'div',
        { className: 'panel intake-project-panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Project Summary'),
          e(
            'span',
            { className: `pill ${project.savedAt ? 'green' : 'warn'}` },
            project.savedAt ? 'saved' : 'unsaved'
          )
        ),
        e(
          'div',
          { className: 'project-title-row' },
          e(
            'div',
            null,
            e('div', { className: 'project-name' }, project.title),
            e('div', { className: 'project-path' }, project.projectFilePath || 'No project file yet')
          )
        ),
        e(
          'div',
          { className: 'panel-body project-card' },
          e(Stat, { label: 'Files', value: cohortRows.length }),
          e(Stat, { label: 'Included', value: included }),
          e(Stat, { label: 'Groups', value: cohorts })
        )
      ),
      e(
        'div',
        { className: 'intake-split-grid' },
        e(
          'div',
          { className: 'panel intake-cohort-panel' },
          e(
            'div',
            { className: 'panel-header' },
                e('div', { className: 'panel-title' }, 'Samples'),
            e(
              'button',
              {
                className: 'primary',
                disabled: !cohortDraftRows.length || !cohortDraftChanged,
                title: cohortDraftChanged
                  ? 'Apply filename, name, and group settings to this project.'
                  : 'No group setup changes to apply.',
                'aria-label': cohortDraftChanged
                  ? 'Apply group setup changes'
                  : 'Apply group setup disabled because there are no changes',
                onClick: () => onCohortApply && onCohortApply(cohortDraftRows),
              },
              'Apply'
            )
          ),
          e(
            'div',
            { className: 'panel-body cohort-setup-list' },
            cohortDraftRows.length
              ? e(
                  'div',
                  { className: 'cohort-setup-row cohort-setup-head' },
                  e('span', null, 'Filename'),
                  e('span', null, 'Type'),
                  e('span', null, 'Name'),
                  e('span', null, 'Group'),
                  e('span', null, 'Remove')
                )
              : null,
            cohortDraftRows.length
              ? cohortDraftRows.map((row) =>
                  e(
                    'div',
                    {
                      key: row.key,
                      className: `cohort-setup-row cohort-setup-data ${selectedSourceKey === row.key ? 'active' : ''}`,
                      role: 'button',
                      tabIndex: 0,
                      title: `Show acquisition records for ${row.filename}`,
                      onClick: () => selectSource(row.key),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectSource(row.key)
                        }
                      },
                    },
	                    e(
	                      'div',
	                      { className: 'cohort-file-cell', title: row.filename },
	                      e('span', null, row.filename)
	                    ),
	                    e('span', { className: 'cohort-type-cell' }, displaySourceTypeLabel(row.type)),
	                    e('input', {
	                      className: 'cohort-name-input',
                      value: row.alias,
                      'aria-label': `Name for ${row.filename}`,
                      onClick: (event) => event.stopPropagation(),
                      onChange: (event) =>
                        setCohortDrafts((current) => ({
                          ...current,
                          [row.key]: {
                            ...(current[row.key] || {}),
                            alias: event.target.value,
                          },
                        })),
                    }),
                    e('input', {
                      className: 'cohort-group-input',
                      value: row.cohort,
                      'aria-label': `Group for ${row.filename}`,
                      onClick: (event) => event.stopPropagation(),
                      onChange: (event) =>
                        setCohortDrafts((current) => ({
                          ...current,
                          [row.key]: {
                            ...(current[row.key] || {}),
                            cohort: event.target.value,
                          },
                        })),
                    }),
                    e(
                      'button',
                      {
                        className: 'row-action danger',
                        title: `Remove ${row.filename}`,
                        'aria-label': `Remove ${row.filename}`,
                        onClick: (event) => {
                          event.stopPropagation()
                          onRemoveSource && onRemoveSource(row.key)
                        },
                      },
                      '×'
                    )
                  )
                )
              : e('div', { className: 'empty' }, 'Import ERG/FVEP workbooks before assigning groups.'),
            null
          )
        ),
        acquisitionRecordsPanel
      )
    )
  }

  function AnalysisPanel({
    project,
    summary,
    rows,
    result,
    options,
    settings,
    scopeLabel,
    onCopy,
    onPlan,
    onMode,
    onMetric,
    onVersion,
    onToggleInclude,
    compact = false,
  }) {
    const stats = result && result.stats ? result.stats : null
    const stratified = stats && stats.blockedBy === 'condition-pooling'
    const sourceFiles = sourceFileSummaries(project.sources || [])
    const summaryTitle = stratified ? 'Stimulus Summary' : 'Group Summary'
    const activeMetricKey = (result && result.plan && result.plan.metricKey) || settings.metricKey
    const [summaryGroup, setSummaryGroup] = React.useState('All')
    const [dispersion, setDispersion] = React.useState('sd')
    const [showRepeats, setShowRepeats] = React.useState(true)
    const [smooth, setSmooth] = React.useState('none')
    const [waveGroup, setWaveGroup] = React.useState('All')
    const [waveEye, setWaveEye] = React.useState('right')
    const conditionRows = result && Array.isArray(result.conditionSummary) ? result.conditionSummary : []
    const groupOptions = ['All', ...uniqueSorted((rows || []).map((row) => row.cohort).filter(Boolean))]
    const activePlan = (result && result.plan) || {}
    const detectedSourceTypes = ((options && options.sourceTypes) || ['ERG', 'FVEP']).filter((item) =>
      ['ERG', 'FVEP'].includes(item)
    )
    const sourceTypes = detectedSourceTypes.length ? detectedSourceTypes : ['ERG', 'FVEP']
    const activeSourceType = ['ERG', 'FVEP'].includes(activePlan.sourceType) ? activePlan.sourceType : sourceTypes[0]
    const modeOptions = analysisModeOptions(project && project.samples, activeSourceType)
    const activeCategoryKey =
      modeOptions.find((item) => item.key === settings.analysisCategoryKey)?.key ||
      analysisCategoryKeyFromPlan(project && project.samples, activePlan) ||
      (modeOptions[0] && modeOptions[0].key) ||
      ''
    const metricOptions = metricOptionsForPlan((options && options.metrics) || null, activePlan)
    const metricValue = metricOptions.includes(settings.metricKey || activePlan.metricKey)
      ? settings.metricKey || activePlan.metricKey
      : metricOptions[0] || settings.metricKey || activePlan.metricKey || 'bAmplitudeUv'
    const versions = ((options && options.metricVersions) || ['raw', 'manual']).filter((item) => item === 'raw' || item === 'manual')
    const activeSummaryGroup = groupOptions.includes(summaryGroup) ? summaryGroup : 'All'
    const activeWaveGroup = groupOptions.includes(waveGroup) ? waveGroup : 'All'
    const linkedRows =
      activeSummaryGroup === 'All' ? rows : rows.filter((row) => row.cohort === activeSummaryGroup)
    const linkedConditionRows =
      activeSummaryGroup === 'All'
        ? conditionRows
        : conditionRows.filter((row) => row.cohort === activeSummaryGroup)
    const linkedSummary =
      activeSummaryGroup === 'All' ? summary : summary.filter((row) => row.cohort === activeSummaryGroup)
    const maxValue = Math.max(1, ...linkedSummary.map((row) => Math.abs(row.mean || 0)))
    return e(
      'section',
      { className: compact ? 'analysis-grid compact-analysis' : 'analysis-grid' },
      e(AnalysisSourceDataPanel, {
        project,
        rows: linkedRows,
        sourceFiles,
        activeMetricKey,
        modeLabel: (modeOptions.find((item) => item.key === activeCategoryKey) || {}).label || activeCategoryKey || 'Mode',
        groupLabel: activeSummaryGroup,
        onCopy,
        onToggleInclude,
      }),
      e(AnalysisSummaryPanel, {
        result,
        summary: linkedSummary,
        rows: linkedRows,
        conditionRows: linkedConditionRows,
        settings,
        summaryTitle,
        scopeLabel,
        stratified,
        maxValue,
        activeMetricKey,
        sourceTypes,
        activeSourceType,
        onPlan,
        modeOptions,
        activeCategoryKey,
        onMode,
        metricOptions,
        metricValue,
        versions,
        onMetric,
        onVersion,
        groupOptions,
        group: activeSummaryGroup,
        onGroup: setSummaryGroup,
        dispersion,
        onDispersion: setDispersion,
        showRepeats,
        onShowRepeats: setShowRepeats,
        smooth,
        onSmooth: setSmooth,
      }),
      e(RepresentativeWaveformPanel, {
        project,
        plan: result && result.plan,
        groupOptions,
        group: activeWaveGroup,
        onGroup: setWaveGroup,
        eye: waveEye,
        onEye: setWaveEye,
      })
    )
  }

  function AnalysisSourceDataPanel({
    project,
    rows,
    sourceFiles,
    activeMetricKey,
    modeLabel,
    groupLabel,
    onCopy,
    onToggleInclude,
  }) {
    const matrix = buildAnalysisDataMatrix(project, rows, activeMetricKey)
    const title = `DATA: ${analysisDataTitleToken(modeLabel || 'Mode')}_${analysisDataTitleToken(groupLabel || 'All', {
      lowercase: true,
    })}_${metricLabel(activeMetricKey)}`
    return e(
      'div',
      { className: 'panel source-data-panel analysis-data-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title analysis-data-title', title }, title),
        e('button', { className: 'panel-action', onClick: onCopy }, 'Copy CSV')
      ),
      e(
        'div',
        { className: 'panel-body table-wrap' },
        e(
          'table',
          {
            className: 'analysis-matrix-table',
            style: { minWidth: '100%' },
          },
          e(
            'colgroup',
            null,
            e('col', { className: 'analysis-col-name' }),
            e('col', { className: 'analysis-col-eye' }),
            ...matrix.stimuli.map((stimulus) => e('col', { key: stimulus.key, className: 'analysis-col-stimulus' })),
            e('col', { className: 'analysis-col-state' })
          ),
          e(
            'thead',
            null,
            e(
              'tr',
              null,
              [
                e('th', { key: 'name' }, 'Name'),
                e('th', { key: 'eye' }, 'Eye'),
                ...matrix.stimuli.map((stimulus) =>
                  e('th', { key: stimulus.key, title: stimulus.label }, stimulus.shortLabel)
                ),
                e('th', { key: 'state' }, 'State'),
              ]
            )
          ),
          e(
            'tbody',
            null,
            matrix.rows.length
              ? matrix.rows.map((row) =>
                  e(
                    'tr',
                    {
                      key: row.key,
                      className: row.state === 'Out' ? 'excluded-row' : '',
                    },
                    e('td', { title: row.name }, row.name),
                    e('td', null, row.eye),
                    ...matrix.stimuli.map((stimulus) => {
                      const cell = row.values[stimulus.key] || {}
                      return e(
                        'td',
                        { key: stimulus.key, className: 'num', title: cell.title || stimulus.label },
                        cell.text || 'NA'
                      )
                    }),
                    e(
                      'td',
                      null,
                      e(
                        'button',
                        {
                          className: `sample-include-toggle analysis-state-toggle row-action ${row.state === 'In' ? 'green' : 'warn'}`,
                          'aria-label': `${row.state === 'In' ? 'Exclude' : 'Include'} ${row.name} ${row.eye}`,
                          onClick: () => onToggleInclude && onToggleInclude(row.sampleIds, row.nextIncluded, row.eyeSide),
                        },
                        row.state
                      )
                    )
                  )
                )
              : e('tr', null, e('td', { colSpan: matrix.stimuli.length + 3 }, 'No rows match the current analysis controls.'))
          )
        )
      ),
      e(
        'div',
        { className: 'repro-strip' },
        e('span', null, `Schema ${project.schema}`),
        e('span', null, sourceFileCountLabel(sourceFiles.length)),
        e('span', null, `${(project.correctionLog || []).length} corrections`),
        e('span', null, project.projectFilePath ? `Project ${project.projectFilePath}` : 'Save project to freeze this analysis state')
      )
    )
  }

  function analysisDataTitleToken(value, options) {
    const text = String(value || '')
      .replace(/groups?/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    const normalized = text || 'all'
    return options && options.lowercase ? normalized.toLowerCase() : normalized
  }

  function AnalysisSummaryPanel({
    result,
    summary,
    rows,
    conditionRows,
    settings,
    summaryTitle,
    scopeLabel,
    stratified,
    maxValue,
    activeMetricKey,
    sourceTypes,
    activeSourceType,
    onPlan,
    modeOptions,
    activeCategoryKey,
    onMode,
    metricOptions,
    metricValue,
    versions,
    onMetric,
    onVersion,
    groupOptions,
    group,
    onGroup,
    dispersion,
    onDispersion,
    showRepeats,
    onShowRepeats,
    smooth,
    onSmooth,
  }) {
    const conditionCount = new Set(conditionRows.map((row) => row.condition).filter(Boolean)).size
    const title = conditionCount > 1 ? 'Response Summary' : summaryTitle
    return e(
      'div',
      { className: 'panel analysis-figure-panel analysis-summary-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title' }, title),
        e(
          'span',
          { className: 'pill' },
          [
            metricOptionLabel(activeMetricKey, metricLabel(activeMetricKey)),
            conditionCount > 1 ? `mean ± ${dispersion.toUpperCase()}` : stratified ? 'stratified' : scopeLabel,
          ]
            .filter(Boolean)
            .join(' · ')
        )
      ),
      e(
        'div',
        { className: 'analysis-plot-control-strip' },
        e(InlineSelect, {
          label: 'Type',
          value: activeSourceType,
          options: sourceTypes,
          onChange: (value) => onPlan && onPlan({ analysisSourceType: value }),
          control: true,
        }),
        e(InlineSelect, {
          label: 'Mode',
          value: activeCategoryKey,
          options: modeOptions.map((item) => item.key),
          labels: Object.fromEntries(modeOptions.map((item) => [item.key, item.label])),
          onChange: (value) => onMode && onMode(value),
          control: true,
        }),
        e(InlineSelect, {
          label: 'Metric',
          value: metricValue,
          options: metricOptions,
          labels: Object.fromEntries(METRICS.map(([key]) => [key, metricLabel(key)])),
          onChange: (value) => onMetric && onMetric(value),
          control: true,
        }),
        e(InlineSelect, {
          label: 'Layer',
          value: (result && result.plan && result.plan.metricVersion) || settings.metricVersion || 'raw',
          options: versions,
          labels: { raw: 'Raw', manual: 'Manual' },
          onChange: (value) => onVersion && onVersion(value),
          control: true,
        }),
        e(InlineSelect, {
          label: 'Group',
          value: group,
          options: groupOptions,
          labels: { All: 'All groups' },
          onChange: onGroup,
        }),
        e(InlineSelect, {
          label: 'Spread',
          value: dispersion,
          options: ['sd', 'sem', 'variance'],
          labels: { sd: 'SD', sem: 'SEM', variance: 'Variance' },
          onChange: onDispersion,
        }),
        e(InlineSelect, {
          label: 'Repeats',
          value: showRepeats ? 'show' : 'hide',
          options: ['show', 'hide'],
          labels: { show: 'Show', hide: 'Hide' },
          onChange: (value) => onShowRepeats(value === 'show'),
        }),
        e(InlineSelect, {
          label: 'Smooth',
          value: smooth,
          options: ['none', 'line'],
          labels: { none: 'None', line: 'Line only' },
          onChange: onSmooth,
        })
      ),
      conditionCount > 1
        ? e(ConditionCurve, {
            rows: conditionRows,
            sourceRows: rows,
            yAxisLabel: metricLabel(activeMetricKey),
            dispersion,
            showRepeats,
            smooth,
            note:
              result && result.waveformSummary && result.waveformSummary.status !== 'not-applicable'
                ? result.waveformSummary.message
                : '',
          })
        : e(CohortSummaryBars, { summary, maxValue, stratified })
    )
  }

  function RepresentativeWaveformPanel({ project, plan, groupOptions, group, onGroup, eye, onEye }) {
    const sample = representativeSample(project && project.samples, plan, group)
    const trace = representativeTrace(sample, eye)
    return e(
      'div',
      { className: 'panel representative-waveform-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title' }, 'Representative Waveform'),
        e('span', { className: 'pill' }, sample ? `${sample.cohort || 'Unassigned'} · ${recordProtocolLabel(sample)}` : 'No trace')
      ),
      e(
        'div',
        { className: 'analysis-plot-control-strip' },
        e(InlineSelect, {
          label: 'Group',
          value: group,
          options: groupOptions,
          labels: { All: 'All groups' },
          onChange: onGroup,
        }),
        e(InlineSelect, {
          label: 'Eye',
          value: eye,
          options: ['right', 'left', 'average'],
          labels: { right: 'Right', left: 'Left', average: 'Average' },
          onChange: onEye,
        })
      ),
      e(
        'div',
        { className: 'panel-body representative-waveform-body' },
        sample && trace
          ? e(RepresentativeTraceSvg, { trace, sample })
          : e('div', { className: 'empty' }, 'No included repeat with trace data matches the current analysis mode.')
      )
    )
  }

  function RepresentativeTraceSvg({ trace, sample }) {
    const xValues = (trace && trace.x ? trace.x : []).map(Number).filter(Number.isFinite)
    const yValues = (trace && trace.y ? trace.y : []).map(Number).filter(Number.isFinite)
    const minX = xValues.length ? Math.min(...xValues) : 0
    const maxX = xValues.length ? Math.max(...xValues) : 1
    const minY = yValues.length ? Math.min(...yValues) : -1
    const maxY = yValues.length ? Math.max(...yValues) : 1
    const width = 520
    const height = 205
    const left = 58
    const right = 18
    const top = 16
    const bottom = 58
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    const xFor = (value) => left + ((value - minX) / Math.max(1e-9, maxX - minX)) * plotWidth
    const yFor = (value) => top + ((maxY - value) / Math.max(1e-9, maxY - minY)) * plotHeight
    const points = (trace.x || [])
      .map((xValue, index) => `${xFor(Number(xValue))},${yFor(Number(trace.y[index]))}`)
      .join(' ')
    return e(
      'div',
      { className: 'representative-trace-wrap' },
      e(
        'svg',
        { className: 'analysis-curve', viewBox: `0 0 ${width} ${height}`, role: 'img' },
        e('line', { x1: left, y1: top, x2: left, y2: top + plotHeight, className: 'axis-line' }),
        e('line', {
          x1: left,
          y1: top + plotHeight,
          x2: left + plotWidth,
          y2: top + plotHeight,
          className: 'axis-line',
        }),
        e('text', {
          x: 15,
          y: top + plotHeight / 2,
          textAnchor: 'middle',
          className: 'axis-title',
          transform: `rotate(-90 15 ${top + plotHeight / 2})`,
        }, 'Amp (µV)'),
        e('text', { x: left + plotWidth / 2, y: height - 17, textAnchor: 'middle', className: 'axis-title' }, 'Time (ms)'),
        e('text', { x: left - 6, y: yFor(maxY) + 4, textAnchor: 'end', className: 'tick-label' }, formatValue(maxY)),
        e('text', { x: left - 6, y: yFor(minY) + 4, textAnchor: 'end', className: 'tick-label' }, formatValue(minY)),
        e('text', { x: xFor(minX), y: top + plotHeight + 17, textAnchor: 'middle', className: 'tick-label' }, formatValue(minX)),
        e('text', { x: xFor(maxX), y: top + plotHeight + 17, textAnchor: 'middle', className: 'tick-label' }, formatValue(maxX)),
        e('polyline', { className: 'curve-line series-a', points })
      ),
      e(
        'div',
        { className: 'waveform-caption' },
        sample
          ? `${sample.subjectId || sample.label} · ${recordProtocolLabel(sample)} · ${displayConditionLabel(sample)}`
          : ''
      )
    )
  }

  function InlineSelect({ label, value, options, labels, onChange, control = false }) {
    const optionList = Array.isArray(options) && options.length ? options : ['All']
    const normalized = optionList.includes(value) ? value : optionList[0]
    return e(
      'label',
      { className: control ? 'inline-select analysis-control' : 'inline-select' },
      e('span', null, label),
      e(
        'select',
        { value: normalized, onChange: (event) => onChange && onChange(event.target.value) },
        optionList.map((option) =>
          e('option', { key: option, value: option }, (labels && labels[option]) || option)
        )
      )
    )
  }

  function AnalysisFigurePanel({
    result,
    summary,
    settings,
    summaryTitle,
    scopeLabel,
    stratified,
    maxValue,
    embedded = false,
  }) {
    const conditionRows = result && result.conditionSummary ? result.conditionSummary : []
    const waveformSummary = result && result.waveformSummary ? result.waveformSummary : null
    const conditionCount = new Set(conditionRows.map((row) => row.condition).filter(Boolean)).size
    const useCurve = conditionCount > 1
    const useWaveform = waveformSummary && waveformSummary.status === 'ok'
    const activeMetricKey = (result && result.plan && result.plan.metricKey) || settings.metricKey
    const title = useWaveform ? 'FVEP Average Waveform' : useCurve ? 'Response Curve' : summaryTitle
    const content = useWaveform
      ? e(FvepWaveformSummary, { waveform: waveformSummary, embedded })
      : useCurve
        ? e(ConditionCurve, {
            rows: conditionRows,
            yAxisLabel: metricLabel(activeMetricKey),
            note:
              waveformSummary && waveformSummary.status !== 'not-applicable' ? waveformSummary.message : '',
            embedded,
          })
        : e(CohortSummaryBars, { summary, maxValue, stratified })
    if (embedded) return content
    return e(
      'div',
      { className: 'panel analysis-figure-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title' }, title),
        e(
          'span',
          { className: 'pill' },
          [
            metricOptionLabel(settings.metricKey, metricLabel(settings.metricKey)),
            useWaveform
              ? 'mean trace ± SEM'
              : useCurve
                ? 'mean ± SEM'
                : stratified
                  ? 'stratified'
                  : scopeLabel,
          ]
            .filter(Boolean)
            .join(' · ')
        )
      ),
      content
    )
  }

  function FvepWaveformSummary({ waveform, embedded = false }) {
    const series = waveform && Array.isArray(waveform.series) ? waveform.series : []
    const allX = series.flatMap((row) => row.x || []).filter(Number.isFinite)
    const allY = series
      .flatMap((row) =>
        (row.meanY || []).flatMap((value, index) => [
          Number(value) - (Number(row.semY && row.semY[index]) || 0),
          Number(value) + (Number(row.semY && row.semY[index]) || 0),
        ])
      )
      .filter(Number.isFinite)
    const minX = allX.length ? Math.min(...allX) : 0
    const maxX = allX.length ? Math.max(...allX) : 1
    const minY = allY.length ? Math.min(...allY) : -1
    const maxY = allY.length ? Math.max(...allY) : 1
    const width = 520
    const height = 230
    const left = 46
    const right = 18
    const top = 18
    const bottom = 42
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    const xFor = (value) => left + ((value - minX) / Math.max(1e-9, maxX - minX)) * plotWidth
    const yFor = (value) => top + ((maxY - value) / Math.max(1e-9, maxY - minY)) * plotHeight
    return e(
      'div',
      { className: 'panel-body fvep-waveform-wrap' },
      e(
        'svg',
        { className: 'analysis-curve', viewBox: `0 0 ${width} ${height}`, role: 'img' },
        e('line', { x1: left, y1: top, x2: left, y2: top + plotHeight, className: 'axis-line' }),
        e('line', {
          x1: left,
          y1: top + plotHeight,
          x2: left + plotWidth,
          y2: top + plotHeight,
          className: 'axis-line',
        }),
        e(
          'text',
          { x: left - 6, y: yFor(maxY) + 4, textAnchor: 'end', className: 'tick-label' },
          formatValue(maxY)
        ),
        e(
          'text',
          { x: left - 6, y: yFor(minY) + 4, textAnchor: 'end', className: 'tick-label' },
          formatValue(minY)
        ),
        e(
          'text',
          { x: xFor(minX), y: top + plotHeight + 16, textAnchor: 'middle', className: 'tick-label' },
          formatValue(minX)
        ),
        e(
          'text',
          { x: xFor(maxX), y: top + plotHeight + 16, textAnchor: 'middle', className: 'tick-label' },
          formatValue(maxX)
        ),
        e('text', { x: 6, y: top + 10, className: 'axis-title' }, 'Amp (µV)'),
        e('text', { x: left + plotWidth - 72, y: height - 7, className: 'axis-title' }, 'Time (ms)'),
        series.flatMap((row, index) => {
          const colorClass = index % 2 === 0 ? 'series-a' : 'series-b'
          const points = (row.x || [])
            .map((xValue, pointIndex) => `${xFor(Number(xValue))},${yFor(Number(row.meanY[pointIndex]))}`)
            .join(' ')
          const upper = (row.x || []).map((xValue, pointIndex) => {
            const sem = Number(row.semY && row.semY[pointIndex]) || 0
            return `${xFor(Number(xValue))},${yFor(Number(row.meanY[pointIndex]) + sem)}`
          })
          const lower = (row.x || [])
            .map((xValue, pointIndex) => {
              const sem = Number(row.semY && row.semY[pointIndex]) || 0
              return `${xFor(Number(xValue))},${yFor(Number(row.meanY[pointIndex]) - sem)}`
            })
            .reverse()
          return [
            e('polygon', {
              key: `${row.cohort}-sem-band`,
              className: `sem-band ${colorClass}`,
              points: [...upper, ...lower].join(' '),
            }),
            e('polyline', { key: `${row.cohort}-mean`, className: `curve-line ${colorClass}`, points }),
            e(
              'text',
              {
                key: `${row.cohort}-label`,
                x: left + plotWidth - 6,
                y: top + 16 + index * 15,
                textAnchor: 'end',
                className: `legend-label ${colorClass}`,
              },
              `${row.cohort} n=${row.n}`
            ),
          ]
        })
      ),
      e(
        'div',
        { className: 'waveform-caption' },
        embedded
          ? `${compactConditionLabel(waveform.condition)} · mean trace ± SEM`
          : `${compactConditionLabel(waveform.condition)} · sample-level average of right/left eye traces`
      )
    )
  }

  function ConditionCurve({
    rows,
    sourceRows,
    yAxisLabel = 'Value',
    note,
    embedded = false,
    dispersion = 'sem',
    showRepeats = false,
    smooth = 'none',
  }) {
    const cohorts = Array.from(new Set(rows.map((row) => row.cohort).filter(Boolean))).sort()
    const conditions = Array.from(new Set(rows.map((row) => row.condition).filter(Boolean))).sort(
      (left, right) => conditionSort(left, right, rows)
    )
    const familyCount = conditionFamilyCount(rows)
    const stimulusAxis = buildStimulusAxis(rows, conditions, familyCount)
    const conditionIndex = new Map(conditions.map((condition, index) => [condition, index]))
    const previewRows = rows.length > 4 ? [] : rows
    const values = rows.map((row) => Number(row.mean)).filter(Number.isFinite)
    const rawMax = values.length ? Math.max(...values) : 1
    const rawMin = values.length ? Math.min(0, ...values) : 0
    const rawRange = Math.max(1, rawMax - rawMin)
    const max = rawMax + rawRange * 0.08
    const min = Math.min(0, rawMin - rawRange * 0.05)
    const width = 520
    const height = 230
    const left = 62
    const right = 64
    const top = 18
    const bottom = 52
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    const xFor = (condition) => {
      return (
        left +
        (conditions.length <= 1
          ? plotWidth / 2
          : ((conditionIndex.get(condition) || 0) / (conditions.length - 1)) * plotWidth)
      )
    }
    const yFor = (value) => top + ((max - value) / Math.max(1e-9, max - min)) * plotHeight
    return e(
      'div',
      { className: 'panel-body analysis-curve-wrap' },
      rows.length
        ? e(
            'svg',
            { className: 'analysis-curve', viewBox: `0 0 ${width} ${height}`, role: 'img' },
            e('line', { x1: left, y1: top, x2: left, y2: top + plotHeight, className: 'axis-line' }),
            e('line', {
              x1: left,
              y1: top + plotHeight,
              x2: left + plotWidth,
              y2: top + plotHeight,
              className: 'axis-line',
            }),
            e('text', {
              x: 15,
              y: top + plotHeight / 2,
              textAnchor: 'middle',
              className: 'axis-title',
              transform: `rotate(-90 15 ${top + plotHeight / 2})`,
            }, yAxisLabel),
            e(
              'text',
              { x: left - 6, y: yFor(max) + 4, textAnchor: 'end', className: 'tick-label' },
              formatValue(max)
            ),
            e(
              'text',
              { x: left - 6, y: yFor(min) + 4, textAnchor: 'end', className: 'tick-label' },
              formatValue(min)
            ),
            e('text', { x: left + plotWidth / 2, y: height - 7, textAnchor: 'middle', className: 'axis-title' }, stimulusAxis.label),
            conditions.map((condition) =>
              e(
                React.Fragment,
                { key: `axis-${condition}` },
                e('line', {
                  x1: xFor(condition),
                  y1: top + plotHeight,
                  x2: xFor(condition),
                  y2: top + plotHeight + 4,
                  className: 'axis-line',
                }),
                e(
                  'text',
                  {
                    x: xFor(condition),
                    y: top + plotHeight + 18,
                    className: 'tick-label',
                    textAnchor: 'middle',
                    transform: `rotate(-28 ${xFor(condition)} ${top + plotHeight + 18})`,
                  },
                  stimulusAxis.enabled
                    ? formatCompactNumber(stimulusAxis.values.get(condition))
                    : conditionAxisLabel(condition, rows)
                )
              )
            ),
            cohorts.flatMap((cohort, cohortIndex) => {
              const colorClass = cohortIndex % 2 === 0 ? 'series-a' : 'series-b'
              const cohortRows = conditions
                .map((condition) => rows.find((row) => row.cohort === cohort && row.condition === condition))
                .filter(Boolean)
              const segments = smooth === 'none' ? conditionSegments(cohortRows) : [{ family: 'smoothed', rows: cohortRows }]
              return [
                ...segments.map((segment) =>
                  e('polyline', {
                    key: `${cohort}-${segment.family}-line`,
                    className: `curve-line ${colorClass}`,
                    points: segment.rows
                      .map((row) => `${xFor(row.condition)},${yFor(Number(row.mean))}`)
                      .join(' '),
                  })
                ),
                ...cohortRows.flatMap((row) => {
                  const x = xFor(row.condition)
                  const y = yFor(Number(row.mean))
                  const spread = dispersionValue(row, dispersion)
                  const yLow = yFor(Number(row.mean) - spread)
                  const yHigh = yFor(Number(row.mean) + spread)
                  const repeatRows = showRepeats
                    ? (sourceRows || []).filter(
                        (sourceRow) => sourceRow.cohort === row.cohort && sourceRow.condition === row.condition
                      )
                    : []
                  return [
                    e('line', {
                      key: `${cohort}-${row.condition}-${dispersion}`,
                      x1: x,
                      y1: yHigh,
                      x2: x,
                      y2: yLow,
                      className: `sem-line ${colorClass}`,
                    }),
                    ...repeatRows.map((sourceRow, repeatIndex) =>
                      e('circle', {
                        key: `${cohort}-${row.condition}-${sourceRow.sampleId}-repeat`,
                        cx: x + (repeatIndex - (repeatRows.length - 1) / 2) * 4,
                        cy: yFor(Number(sourceRow.value)),
                        r: 2.4,
                        className: `repeat-point ${colorClass}`,
                      })
                    ),
                    e('circle', {
                      key: `${cohort}-${row.condition}-point`,
                      cx: x,
                      cy: y,
                      r: 4,
                      className: `curve-point ${colorClass}`,
                    }),
                  ]
                }),
                e(
                  'text',
                  {
                    key: `${cohort}-label`,
                    x: left + plotWidth + 12,
                    y: top + 16 + cohortIndex * 15,
                    textAnchor: 'start',
                    className: `legend-label ${colorClass}`,
                  },
                  cohort
                ),
              ]
            })
          )
        : e('div', { className: 'empty' }, 'No finite included records for this analysis scope.'),
      e(
        'div',
        { className: embedded ? 'curve-source-grid embedded' : 'curve-source-grid' },
        embedded
          ? e(
              'div',
              { className: note ? 'curve-source-note' : 'curve-source-row' },
              note || curveSummaryLabel(rows.length, familyCount)
            )
          : [
              note ? e('div', { key: 'note', className: 'curve-source-note' }, note) : null,
              ...previewRows.map((row) =>
                e(
                  'div',
                  { key: `${row.condition}-${row.cohort}`, className: 'curve-source-row' },
                  e('span', null, `${summaryConditionLabel(row)} · ${row.cohort}`),
                  e('strong', null, `${formatValue(row.mean)} ± ${formatValue(row.sem)} · n=${row.n}`)
                )
              ),
              rows.length > previewRows.length
                ? e(
                    'div',
                    { key: 'more', className: 'curve-source-row muted' },
                    e('span', null, `${curveSummaryLabel(rows.length, familyCount)} in source data`),
                    e('strong', null, 'xlsx')
                  )
                : null,
            ]
      )
    )
  }

  function CohortSummaryBars({ summary, maxValue, stratified }) {
    return e(
      'div',
      { className: 'panel-body summary-bars' },
      summary.length
        ? summary.map((row) =>
            e(
              'div',
              { key: `${row.condition || 'all'}-${row.cohort}`, className: 'bar-row' },
              e(
                'div',
                { title: row.condition || '' },
                stratified
                  ? `${summaryConditionLabel(row)} · ${row.cohort} n=${row.n}`
                  : `${row.cohort} n=${row.n}`
              ),
              e(
                'div',
                { className: 'bar-track' },
                e('div', {
                  className: 'bar-fill',
                  style: { width: `${Math.max(4, (Math.abs(row.mean || 0) / maxValue) * 100)}%` },
                })
              ),
              e('div', { className: 'num' }, formatValue(row.mean))
            )
          )
        : e('div', { className: 'empty' }, 'No finite included records for this analysis scope.')
    )
  }

  function ExportPanel({
    project,
    report,
    result,
    summary,
    settings,
    scopeLabel,
    reportScope,
    onReportScope,
    onExportPdf,
    onCopy,
  }) {
    const samples = project.samples || []
    const included = samples.filter((sample) => sample.included !== false).length
    const sourceFiles = sourceFileSummaries(project.sources || [])
    const figures = report && Array.isArray(report.figures) ? report.figures : []
    const tables = report && Array.isArray(report.tables) ? report.tables : []
    const scopes = report && Array.isArray(report.scopes) ? report.scopes : []
    const readiness = report && Array.isArray(report.readiness) ? report.readiness : []
    const reportSourceRows = result && Array.isArray(result.sourceRows) ? result.sourceRows : []
    const canExportPdf = reportSourceRows.length > 0
    const canCopySourceRows = reportSourceRows.length > 0
    const visibleFigures = figures.length > 1 ? figures.slice(0, 1) : figures
    const visibleTables = prioritizedReportTables(tables, 2)
    const visibleReadiness = prioritizedReadiness(readiness, 5)
    const manifestSheets =
      report && report.exportManifest && Array.isArray(report.exportManifest.sheets)
        ? report.exportManifest.sheets
        : WORKBOOK_SHEETS
    const visibleManifestSheets = manifestSheets.length > 11 ? manifestSheets.slice(0, 10) : manifestSheets
    return e(
      'section',
      { className: 'export-grid' },
      e(
        'div',
        { className: 'panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Report Package'),
          e(
            'span',
            { className: `pill ${project.savedAt ? 'green' : 'warn'}` },
            project.savedAt ? 'saved' : 'unsaved'
          )
        ),
        e(
          'div',
          { className: 'panel-body report-package-body' },
          e(
            'div',
            { className: 'report-stat-grid' },
            e(ReportStat, { label: 'Files', value: sourceFiles.length }),
            e(ReportStat, { label: 'Included', value: included }),
            e(ReportStat, {
              label: 'Figures',
              value: figures.filter((figure) => figure.status === 'ready').length,
            }),
            e(ReportStat, {
              label: 'Tables',
              value: tables.length,
            })
          ),
          e(
            'div',
            { className: 'export-actions compact' },
            e(
              'button',
              {
                className: 'primary',
                disabled: !canExportPdf,
                title: canExportPdf
                  ? 'Export the current report package as PDF.'
                  : 'Choose a report scope with source rows before exporting PDF.',
                'aria-label': canExportPdf
                  ? 'Export current report package as PDF'
                  : 'Export PDF disabled until report source rows are available',
                onClick: onExportPdf,
              },
              'Export PDF'
            ),
            e(
              'button',
              {
                disabled: !canCopySourceRows,
                title: canCopySourceRows
                  ? 'Copy report source rows as CSV.'
                  : 'Choose a report scope with source rows before copying CSV.',
                'aria-label': canCopySourceRows
                  ? 'Copy report source rows as CSV'
                  : 'Copy CSV disabled until report source rows are available',
                onClick: onCopy,
              },
              'Copy CSV'
            )
          )
        )
      ),
      e(ReportScopePanel, { scopes, reportScope, onReportScope }),
      e(
        'div',
        { className: 'panel report-figure-preview-panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Figure Preview'),
          e('span', { className: 'pill' }, `${figures.length}`)
        ),
        result
          ? e(
              'div',
              { className: 'report-figure-body' },
              e(AnalysisFigurePanel, {
                result,
                summary: summary || [],
                settings,
                summaryTitle:
                  result && result.stats && result.stats.blockedBy === 'condition-pooling'
                    ? 'Stimulus Summary'
                    : 'Group Summary',
                scopeLabel,
                stratified: result && result.stats && result.stats.blockedBy === 'condition-pooling',
                maxValue: Math.max(1, ...(summary || []).map((row) => Math.abs(row.mean || 0))),
                embedded: true,
              })
            )
          : e('div', { className: 'panel-body empty' }, 'No active analysis result.')
      ),
      e(
        'div',
        { className: 'panel report-figures-panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Figure Index'),
          e('span', { className: 'pill' }, `${figures.length}`)
        ),
        e('div', { className: 'panel-body report-list' }, [
          ...visibleFigures.map((figure) =>
            e(
              'div',
              {
                key: figure.id,
                className: `report-row ${figure.status === 'blocked' ? 'blocked' : ''}`,
              },
              e('span', null, figure.title),
              e('strong', null, figure.detail)
            )
          ),
          figures.length > visibleFigures.length
            ? e(
                'div',
                { key: 'more-figures', className: 'report-row muted' },
                e('span', null, `${figures.length - visibleFigures.length} more figure checks`),
                e('strong', null, 'xlsx')
              )
            : null,
        ])
      ),
      e(ReportTablePreviewPanel, { tables }),
      e(
        'div',
        { className: 'panel report-tables-panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Table Index'),
          e('span', { className: 'pill' }, `${tables.length}`)
        ),
        e('div', { className: 'panel-body report-list' }, [
          ...visibleTables.map((table) =>
            e(
              'div',
              { key: table.id, className: 'report-row' },
              e('span', null, table.title),
              e('strong', null, `${table.rows} rows`)
            )
          ),
          tables.length > visibleTables.length
            ? e(
                'div',
                { key: 'more-tables', className: 'report-row muted' },
                e('span', null, `${tables.length - visibleTables.length} more tables`),
                e('strong', null, 'xlsx')
              )
            : null,
        ])
      ),
      e(
        'div',
        { className: 'panel workbook-panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Workbook Manifest'),
          e('span', { className: 'pill' }, 'xlsx')
        ),
        e('div', { className: 'panel-body workbook-sheet-grid' }, [
          ...visibleManifestSheets.map((sheet) => e('span', { key: sheet, className: 'sheet-chip' }, sheet)),
          manifestSheets.length > visibleManifestSheets.length
            ? e(
                'span',
                { key: 'more-sheets', className: 'sheet-chip muted' },
                `${manifestSheets.length - visibleManifestSheets.length} more`
              )
            : null,
        ])
      ),
      e(
        'div',
        { className: 'panel export-readiness-panel' },
        e('div', { className: 'panel-header' }, e('div', { className: 'panel-title' }, 'Readiness')),
        e(
          'div',
          { className: 'panel-body readiness-list' },
          (readiness.length
            ? visibleReadiness
            : [
                {
                  label: project.savedAt ? 'Project file saved' : 'Project file not saved',
                  status: project.savedAt ? 'ok' : 'warn',
                },
                { label: `${included}/${samples.length} records included`, status: included ? 'ok' : 'warn' },
                {
                  label: `${sourceFiles.length} source file${sourceFiles.length === 1 ? '' : 's'} linked`,
                  status: sourceFiles.length ? 'ok' : 'warn',
                },
              ]
          ).map((row) => readinessRow(row.label, row.status)),
          readiness.length > visibleReadiness.length
            ? readinessRow(
                `${readiness.length - visibleReadiness.length} more readiness checks in export`,
                'ok'
              )
            : null
        )
      )
    )
  }

  function ReportTablePreviewPanel({ tables }) {
    const sourceTable = (tables || []).find((table) => table.id === 'analysis_source') || {}
    const summaryTable =
      (tables || []).find((table) => table.id === 'stimulus_summary' && table.rows) ||
      (tables || []).find((table) => table.id === 'group_summary') ||
      {}
    const rows = sourceTable.previewRows || []
    const summaryRows = summaryTable.previewRows || []
    const visibleRows = rows.length > 1 ? rows.slice(0, 1) : rows
    const visibleSummaryRows = summaryRows.length > 1 ? summaryRows.slice(0, 1) : summaryRows
    return e(
      'div',
      { className: 'panel report-table-preview-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title' }, 'Table Preview'),
        e('span', { className: 'pill' }, `${sourceTable.rows || 0} source rows`)
      ),
      e(
        'div',
        { className: 'panel-body report-table-preview' },
        e(
          'table',
          null,
          e(
            'thead',
            null,
            e(
              'tr',
              null,
              ['Subject', 'Group', 'In', 'Value'].map((head) => e('th', { key: head }, head))
            )
          ),
          e(
            'tbody',
            null,
            rows.length
              ? [
                  ...visibleRows.map((row, index) =>
                    e(
                      'tr',
                      { key: `${row.subject}-${index}` },
                      e('td', null, row.subject),
                      e('td', null, row.cohort),
                      e('td', null, row.included ? 'In' : 'Out'),
                      e('td', { className: 'num' }, formatValue(row.value))
                    )
                  ),
                  rows.length > visibleRows.length
                    ? e(
                        'tr',
                        { key: 'more-source-rows' },
                        e('td', { colSpan: 3 }, `${rows.length - visibleRows.length} more source rows`),
                        e('td', { className: 'num' }, 'xlsx')
                      )
                    : null,
                ]
              : e('tr', null, e('td', { colSpan: 4 }, 'No source rows.'))
          )
        ),
        e(
          'div',
          { className: 'report-summary-preview' },
          summaryRows.length
            ? [
                ...visibleSummaryRows.map((row, index) =>
                  e(
                    'div',
                    {
                      key: `${row.condition || 'all'}-${row.cohort}-${index}`,
                      className: 'report-summary-row',
                    },
                    e('span', null, `${compactConditionLabel(row.condition)} · ${row.cohort}`),
                    e('strong', null, `${formatValue(row.mean)} ± ${formatValue(row.sem)} · n=${row.n}`)
                  )
                ),
                summaryRows.length > visibleSummaryRows.length
                  ? e(
                      'div',
                      { key: 'more-summary-rows', className: 'report-summary-row muted' },
                      e('span', null, `${summaryRows.length - visibleSummaryRows.length} more summaries`),
                      e('strong', null, 'xlsx')
                    )
                  : null,
              ]
            : e('div', { className: 'empty' }, 'No summary rows.')
        )
      )
    )
  }

  function ReportScopePanel({ scopes, reportScope, onReportScope }) {
    const activeScope = reportScope || 'current'
    const rows = Array.isArray(scopes) ? scopes : []
    const active = rows.find((row) => row.id === activeScope) || rows[0] || {}
    const options = [
      ['current', 'Current'],
      ['erg-preset', 'ERG'],
      ['fvep-preset', 'FVEP'],
      ['source-appendix', 'Appendix'],
    ]
    return e(
      'div',
      { className: 'panel report-scope-panel' },
      e(
        'div',
        { className: 'panel-header' },
        e('div', { className: 'panel-title' }, 'Report Scope'),
        e('span', { className: 'pill' }, `${active.readyFigures || 0}/${active.totalFigures || 0}`)
      ),
      e(
        'div',
        { className: 'panel-body report-scope-body' },
        e(
          'div',
          { className: 'report-scope-options' },
          options.map(([id, label]) => {
            const scope = rows.find((row) => row.id === id)
            const disabled = !scope || !scope.records
            return e(
              'button',
              {
                key: id,
                className: id === activeScope ? 'active' : '',
                disabled,
                title: disabled
                  ? `${label} report scope has no matching source records.`
                  : `Switch report scope to ${label}.`,
                'aria-label': disabled
                  ? `${label} report scope disabled because it has no matching source records`
                  : `Switch report scope to ${label}`,
                onClick: () => !disabled && onReportScope && onReportScope(id),
              },
              label
            )
          })
        ),
        e(
          'div',
          { className: 'report-scope-detail' },
          e('strong', null, active.title || reportScopeLabel(activeScope)),
          e(
            'span',
            null,
            `${active.records || 0} records · ${active.readyFigures || 0}/${active.totalFigures || 0} figures`
          )
        )
      )
    )
  }

  function reportScopeLabel(scope) {
    return (
      {
        current: 'Current analysis',
        'erg-preset': 'Full ERG preset',
        'fvep-preset': 'Full FVEP preset',
        'source-appendix': 'Source appendix',
      }[scope] || 'Current analysis'
    )
  }

  function reportScopeSourceType(scope) {
    if (scope === 'erg-preset') return 'ERG'
    if (scope === 'fvep-preset') return 'FVEP'
    return ''
  }

  function ReportStat({ label, value }) {
    return e('div', { className: 'report-stat' }, e('span', null, label), e('strong', null, value))
  }

  function buildReportAnalysisPlan(activePlan, reportScope) {
    const plan = activePlan || {}
    const base = {
      sourceType: plan.sourceType || 'All',
      protocolMode: plan.protocolMode || 'All',
      protocolFamily: plan.protocolFamily || 'All',
      condition: plan.condition || 'All',
      metricKey: plan.metricKey || 'bAmplitudeUv',
      metricVersion: plan.metricVersion || 'raw',
      grouping: plan.grouping || 'cohort',
      biologicalUnit: plan.biologicalUnit || 'subject',
      eyeAggregation: plan.eyeAggregation || 'average-eyes',
      comparisonDesign: plan.comparisonDesign || 'independent',
      statsPolicy: 'descriptive-only',
    }
    if (reportScope === 'erg-preset') {
      return {
        ...base,
        sourceType: 'ERG',
        protocolMode: 'All',
        protocolFamily: 'All',
        condition: 'All',
        metricKey: protocols.compatibleMetricForPlan(base.metricKey, { sourceType: 'ERG', protocolMode: 'All' }),
      }
    }
    if (reportScope === 'fvep-preset') {
      return {
        ...base,
        sourceType: 'FVEP',
        protocolMode: 'FVEP',
        protocolFamily: 'All',
        condition: 'All',
        metricKey: protocols.compatibleMetricForPlan(base.metricKey, {
          sourceType: 'FVEP',
          protocolMode: 'FVEP',
        }),
      }
    }
    if (reportScope === 'source-appendix') {
      return {
        ...base,
        sourceType: 'All',
        protocolMode: 'All',
        protocolFamily: 'All',
        condition: 'All',
      }
    }
    return plan
  }

  function metricLabel(key) {
    return protocols.metricLabel(key)
  }

  function metricUnit(key) {
    return protocols.metricUnit(key)
  }

  function metricNote(key) {
    return protocols.metricNote(key)
  }

  function metricOptionsForPlan(optionKeys, plan) {
    return protocols.metricOptionsForPlan(optionKeys, plan)
  }

  function compactConditionLabel(condition) {
    const text = String(condition || '').trim()
    const parts = text
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      const parsed = parseConditionLabel(text)
      if (parsed.shortLabel) return parsed.shortLabel
      const stimulus = parts[1].replace('白色光:', '').replace('cd·s/m²', 'cds').trim()
      return `${parts[0]} ${stimulus}`.trim()
    }
    return parts[0] || text || 'Stimulus'
  }

  function summaryConditionLabel(row) {
    return (row && row.conditionShort) || compactConditionLabel(row && row.condition)
  }

  function conditionAxisLabel(condition, rows) {
    const row = (rows || []).find((item) => item.condition === condition)
    return summaryConditionLabel(row || { condition })
  }

  function conditionSegments(rows) {
    const segments = []
    ;(rows || []).forEach((row) => {
      const family = row.protocolFamily || 'Protocol'
      const last = segments[segments.length - 1]
      if (!last || last.family !== family) {
        segments.push({ family, rows: [row] })
      } else {
        last.rows.push(row)
      }
    })
    return segments
  }

  function dispersionValue(row, dispersion) {
    if (dispersion === 'sd') return Number(row && row.sd) || 0
    if (dispersion === 'variance') return Math.sqrt(Math.max(0, Number(row && row.variance) || 0))
    return Number(row && row.sem) || 0
  }

  function conditionFamilyCount(rows) {
    return Array.from(new Set((rows || []).map((row) => row.protocolFamily || '').filter(Boolean))).length
  }

  function buildStimulusAxis(rows, conditions, familyCount) {
    const values = new Map()
    const units = new Set()
    ;(conditions || []).forEach((condition) => {
      const row = (rows || []).find((item) => item.condition === condition) || {}
      const value = Number(row.stimulusValue)
      if (Number.isFinite(value)) values.set(condition, value)
      if (row.stimulusUnit) units.add(row.stimulusUnit)
    })
    const numericValues = Array.from(values.values())
    const enabled = familyCount <= 1 && conditions.length > 1 && values.size === conditions.length
    const min = numericValues.length ? Math.min(...numericValues) : 0
    const max = numericValues.length ? Math.max(...numericValues) : 1
    const unit = units.size === 1 ? Array.from(units)[0] : ''
    return {
      enabled,
      values,
      min,
      max: max === min ? min + 1 : max,
      label: enabled && unit ? `Stimulus (${displayStimulusUnit(unit)})` : 'Stimulus',
    }
  }

  function curveSummaryLabel(rowCount, familyCount) {
    return familyCount > 1
      ? `${rowCount} stimulus/group summaries · ${familyCount} protocol families`
      : `${rowCount} stimulus/group summaries`
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
    const row = (rows || []).find((item) => item.condition === condition) || {}
    const parsed = parseConditionLabel(condition)
    return {
      protocolIndex: Number.isFinite(Number(row.protocolIndex))
        ? Number(row.protocolIndex)
        : parsed.protocolIndex,
      stimulusValue: Number.isFinite(Number(row.stimulusValue))
        ? Number(row.stimulusValue)
        : parsed.stimulusValue,
    }
  }

  function parseConditionLabel(condition) {
    const text = String(condition || '').trim()
    const parts = text
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean)
    const protocol = parts[0] || text
    const stimulus = parts[1] || ''
    const protocolMatch = protocol.match(/^([A-Za-z]+)\((\d+)\)_([^\s·]+)/)
    const stimulusMatch = stimulus.match(
      /([bf]?)白色光:([+-]?\d+(?:\.\d+)?)([^,，]+)?[,，]\s*([+-]?\d+(?:\.\d+)?)\s*ms/i
    )
    const stimulusValue = stimulusMatch ? Number(stimulusMatch[2]) : NaN
    const protocolFamily = protocolMatch ? protocolMatch[3] : ''
    const shortLabel = Number.isFinite(stimulusValue)
      ? `${protocolFamily || protocol} ${formatCompactNumber(stimulusValue)}`.trim()
      : ''
    return {
      protocolIndex: protocolMatch ? Number(protocolMatch[2]) : NaN,
      protocolFamily,
      stimulusValue,
      shortLabel,
    }
  }

  function formatCompactNumber(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return ''
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 1000) / 1000)
  }

  function sourceFileSummaries(sources) {
    const files = new Map()
    ;(sources || []).forEach((source) => {
      const key = source.key || source.path || source.name || 'Unknown source'
      const current = files.get(key) || {
        key,
        name: source.name || 'Unknown source',
        records: 0,
        modes: [],
        type: source.type || '',
      }
      current.records += Number(source.records) || 0
      ;(Array.isArray(source.modes) ? source.modes : [source.mode]).forEach((mode) => {
        if (mode && !current.modes.includes(mode)) current.modes.push(mode)
      })
      current.type = source.type || sourceTypeFromModes(current.modes)
      files.set(key, current)
    })
    return Array.from(files.values()).map((source) => ({
      ...source,
      modes: source.modes.sort((left, right) => left.localeCompare(right)),
      type: sourceTypeFromModes(source.modes),
    }))
  }

  function sourceCohortRows(samples, sources) {
    const rows = new Map()
	    ;(samples || []).forEach((sample) => {
	      const key = sourceKeyFromSample(sample)
	      const source =
	        (sources || []).find((item) => String(item.key || item.path || item.name || '') === key) || {}
	      const filename = source.name || fileNameFromPath(key) || sample.sourceName || 'Unknown source'
	      const current = rows.get(key) || {
	        key,
	        filename,
	        type: source.type || '',
	        records: 0,
	        modes: [],
		        aliases: [],
		        sourceAliases: [],
	        cohorts: [],
	      }
	      current.records += 1
	      current.type = source.type || current.type || ''
	      if (sample.mode && !current.modes.includes(sample.mode)) current.modes.push(sample.mode)
	      const sourceAlias = sample.metadata && sample.metadata.sourceAlias ? String(sample.metadata.sourceAlias) : ''
	      if (sourceAlias && !current.sourceAliases.includes(sourceAlias)) current.sourceAliases.push(sourceAlias)
	      if (sample.subjectId && !current.aliases.includes(sample.subjectId)) current.aliases.push(sample.subjectId)
      if (sample.cohort && !current.cohorts.includes(sample.cohort)) current.cohorts.push(sample.cohort)
      rows.set(key, current)
    })
    return Array.from(rows.values())
	      .map((row) => {
		        const alias = row.sourceAliases.length === 1 ? row.sourceAliases[0] : sourceAliasFromFilename(row.filename)
	        const cohort = row.cohorts.length === 1 ? row.cohorts[0] : 'Mixed'
	        const type = row.type || sourceTypeFromModes(row.modes)
	        return {
	          ...row,
	          modes: row.modes.sort((left, right) => left.localeCompare(right)),
	          type,
	          alias,
	          cohort,
          originalAlias: alias,
          originalCohort: cohort,
        }
      })
      .sort((left, right) => left.filename.localeCompare(right.filename))
  }

  function sourceKeyFromSample(sample) {
    if (projectCore.sourceKeyFromSample) return projectCore.sourceKeyFromSample(sample)
    return (
      (sample && sample.metadata && sample.metadata.sourcePath) ||
      (sample && sample.sourceName) ||
      'Unknown source'
    )
  }

  function fileNameFromPath(value) {
    const text = String(value || '')
    return text.split(/[\\/]/).filter(Boolean).pop() || text
  }

  function sourceAliasFromFilename(filename) {
	    return String(fileNameFromPath(filename) || 'Sample')
	      .replace(/\.(xlsx|xls|csv|txt|ep|ergproject|json)$/i, '')
	      .replace(/[_\s-]*(FERG|ERG|FVEP|VEP)$/i, '')
	      .trim() || 'Sample'
	  }

  function isExpectedWorkbookImport(records) {
    return projectCore.hasExpectedWorkbookFormat
      ? projectCore.hasExpectedWorkbookFormat(records)
      : Array.isArray(records) &&
          records.length > 0 &&
          records.some((sample) => !(sample.metadata && sample.metadata.fallbackParser))
  }

  function isExpectedProjectPayload(payload) {
    return projectCore.isProjectFilePayload
      ? projectCore.isProjectFilePayload(payload)
      : Boolean(
          payload &&
            typeof payload === 'object' &&
            payload.schema === 'erg-viewer-v2-project' &&
            Array.isArray(payload.samples)
        )
  }

  function friendlyImportError(error, kind) {
    const message = error && error.message ? String(error.message) : ''
    if (/not an ERG\/FVEP acquisition workbook/i.test(message)) return 'not an ERG/FVEP acquisition workbook'
    if (/not an ERG Viewer project file/i.test(message)) return 'not an ERG Viewer project file'
    if (/read denied/i.test(message)) return `${kind || 'File'} type is not allowed`
    if (/unexpected token|json/i.test(message)) return 'file content is not a valid ERG Viewer project'
    return message || `${kind || 'File'} could not be opened`
  }

  function formatImportFailures(failed) {
    return (failed || [])
      .slice(0, 6)
      .map((item) => `${fileNameFromPath(item.filePath)}: ${item.reason}`)
      .join('\n')
  }

	  function displaySourceTypeLabel(type) {
	    return String(type || '').toUpperCase() === 'FVEP' ? 'VEP' : 'ERG'
	  }

	  function isDemoOnlyProject(project) {
	    const normalized = project && typeof project === 'object' ? project : {}
	    const samples = Array.isArray(normalized.samples) ? normalized.samples : []
	    if (!samples.length || normalized.projectFilePath) return false
	    return samples.every((sample) => {
	      const sourceName = String(sample.sourceName || '').toLowerCase()
	      const operator = String(sample.metadata && sample.metadata.operator ? sample.metadata.operator : '').toLowerCase()
	      return sourceName === 'synthetic demo' || operator === 'demo'
	    })
	  }

  function recordSourceType(sample) {
    if (projectCore.sourceTypeFromMode) return projectCore.sourceTypeFromMode(sample?.mode)
    return String(sample?.mode || '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
  }

  function sourceTypeFromModes(modes) {
    if (projectCore.sourceTypeFromModes) return projectCore.sourceTypeFromModes(modes)
    const normalizedModes = Array.isArray(modes) ? modes : []
    return normalizedModes.length > 0 &&
      normalizedModes.every((mode) => recordSourceType({ mode }) === 'FVEP')
      ? 'FVEP'
      : 'ERG'
  }

  function sourceFileCountLabel(count) {
    return `${count} source file${count === 1 ? '' : 's'}`
  }

  function prioritizedReadiness(rows, limit) {
    const rank = { error: 0, warn: 1, ok: 2 }
    return (rows || [])
      .map((row, index) => ({ ...row, index }))
      .sort((left, right) => {
        const leftRank = rank[left.status] == null ? 2 : rank[left.status]
        const rightRank = rank[right.status] == null ? 2 : rank[right.status]
        return leftRank - rightRank || left.index - right.index
      })
      .slice(0, limit)
  }

  function prioritizedReportTables(rows, limit) {
    const priority = {
      paired_readiness: 0,
      analysis_warnings: 1,
      analysis_source: 2,
      stimulus_summary: 3,
      group_summary: 4,
    }
    return (rows || [])
      .map((row, index) => ({ ...row, index }))
      .sort((left, right) => {
        const leftHasRows = Number(left.rows) > 0 ? 0 : 1
        const rightHasRows = Number(right.rows) > 0 ? 0 : 1
        const leftPriority = priority[left.id] == null ? 9 : priority[left.id]
        const rightPriority = priority[right.id] == null ? 9 : priority[right.id]
        return leftHasRows - rightHasRows || leftPriority - rightPriority || left.index - right.index
      })
      .slice(0, limit)
  }

  function metricOptionLabel(key, label) {
    return metricLabel(key || label)
  }

  function readinessRow(text, state) {
    const normalized = state === 'error' ? 'error' : state === 'warn' ? 'warn' : 'ok'
    return e(
      'div',
      { key: text, className: `readiness-row ${normalized}` },
      e('span', null),
      e('strong', null, text)
    )
  }

  function Inspector({ sample, onSamplePatch }) {
    if (!sample) {
      return e(
        'aside',
        { className: 'inspector' },
        e(
          'section',
          { className: 'panel' },
          e('div', { className: 'panel-body empty' }, 'Import or select a sample to inspect metrics.')
        )
      )
    }
    const raw = sample.metrics.raw
    const corrected = metrics.correctedMetrics(raw, { ...sample.corrections, mode: sample.mode })
    const manualCount = manualPicks.countManualPoints(sample.corrections && sample.corrections.manualPoints)
    return e(
      'aside',
      { className: 'inspector' },
      e(
        'section',
        { className: 'panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Metadata')
        ),
        e(
          'div',
          { className: 'panel-body' },
          e(
            'div',
            { className: 'field-grid' },
            e(ReadonlyField, { label: 'Filename', value: reviewSourceFilename(sample), wide: true }),
            e(EditableField, {
              label: 'Group',
              value: sample.cohort,
              onChange: (cohort) => onSamplePatch({ cohort }),
            }),
            e(ReadonlyField, { label: 'Name', value: reviewSampleName(sample) }),
            e(ReadonlyField, { label: 'Mode', value: recordProtocolLabel(sample) }),
            e(ReadonlyField, { label: 'Acquisition', value: sample.acquisitionId }),
            e(ReadonlyField, { label: 'Stimulus', value: displayConditionLabel(sample), wide: true })
          )
        )
      ),
      e(
        'section',
        { className: 'panel compact-metrics-panel' },
        e(
          'div',
          { className: 'panel-header' },
          e('div', { className: 'panel-title' }, 'Measurement'),
          e('span', { className: manualCount ? 'pill green' : 'pill' }, `${manualCount} manual`)
        ),
        e(
          'div',
          { className: 'panel-body compact-metric-list' },
          e(MetricSideBlock, { label: 'OD', sample, side: 'right', fallbackRaw: raw, fallbackCorrected: corrected }),
          e(MetricSideBlock, { label: 'OS', sample, side: 'left', fallbackRaw: raw, fallbackCorrected: corrected })
        )
      )
    )
  }

  function MetricSideBlock({ label, sample, side, fallbackRaw, fallbackCorrected }) {
    const scoped = sideScopedSample(sample, side)
    const raw = scoped ? metrics.deriveRawMetrics(scoped) : fallbackRaw
    const corrected = scoped
      ? metrics.correctedMetrics(raw, { ...scoped.corrections, mode: sample.mode })
      : fallbackCorrected
    const rows = metricCompareRows(raw, corrected, sample)
    return e(
      'div',
      { className: 'metric-side-block' },
      e('div', { className: 'metric-side-title' }, label),
      e(
        'div',
        { className: 'compact-metric-row compact-metric-head' },
        e('span', null, 'Metric'),
        e('span', null, 'Raw'),
        e('span', null, 'Manual')
      ),
      rows.length ? rows : e('div', { className: 'compact-metric-row empty' }, e('span', null, 'No metric for this eye'), e('span', null, 'NA'), e('span', null, 'NA')),
      ...opsPointRows(sample, side)
    )
  }

  function sideScopedSample(sample, side) {
    if (!sample || (side !== 'right' && side !== 'left')) return null
    const trace = sample.traces && sample.traces[side]
    const marks = sample.machineMarks && sample.machineMarks[side]
    const manual = sample.corrections && sample.corrections.manualPoints
    return {
      ...sample,
      traces: {
        right: side === 'right' ? trace : null,
        left: side === 'left' ? trace : null,
      },
      machineMarks: {
        right: side === 'right' ? marks : '',
        left: side === 'left' ? marks : '',
      },
      corrections: {
        ...(sample.corrections || {}),
        manualPoints: {
          right: side === 'right' && manual && manual.right ? manual.right : {},
          left: side === 'left' && manual && manual.left ? manual.left : {},
        },
      },
    }
  }

  function ReadonlyField({ label, value, title, wide }) {
    return e(
      'div',
      { className: `field ${wide ? 'wide' : ''}` },
      e('label', null, label),
      e('div', { className: 'field-readonly', title: title || value || '' }, value || '')
    )
  }

  function EditableField({ label, value, onChange }) {
    return e(
      'div',
      { className: 'field' },
      e('label', null, label),
      e('input', { value: value || '', onChange: (event) => onChange(event.target.value) })
    )
  }

  function manualTargetsForMode(mode) {
    const normalized = String(mode || '').toLowerCase()
    if (normalized === 'fvep') {
      return ['N1', 'P1', 'N2', 'P2'].map((key) => ({ key, label: key }))
    }
    if (normalized === 'dops') {
      return [1, 2, 3, 4, 5].flatMap((index) => [
        { key: `op${index}-peak`, label: `OP${index} peak` },
        { key: `op${index}-valley`, label: `OP${index} valley` },
      ])
    }
    if (normalized === 'flicker') {
      return [
        { key: 'flickerTrough', label: 'Flicker trough' },
        { key: 'flickerPeak', label: 'Flicker peak' },
      ]
    }
    return [
      { key: 'a', label: 'a-wave' },
      { key: 'b', label: 'b-wave' },
    ]
  }

  function parseQaManualPickPreset(rawValue, pickTargets) {
    const value = String(rawValue || '').trim()
    if (!value) return null
    const [side, key] = value.split(':')
    if (!['right', 'left'].includes(side) || !key) return null
    const target = (pickTargets || []).find((item) => item.key === key)
    return target ? { side, key: target.key, label: target.label } : null
  }

  function metricCompareRows(raw, corrected, sample) {
    const mode = sample && sample.mode
    const hideImplicitTime = ['Rod', 'Cone', 'Max'].includes(acquisitionCategory(sample).key)
    return METRICS.filter(([key]) => raw[key] != null || corrected[key] != null)
      .filter(([key]) => !(String(mode || '').toLowerCase() === 'dops' && /^op[1-5]AmplitudeUv$/.test(key)))
      .filter(([key]) => !(hideImplicitTime && /LatencyMs$/.test(key)))
      .sort(([left], [right]) => metricReviewPriority(left, mode) - metricReviewPriority(right, mode))
      .map(([key]) =>
        e(
          'div',
          { className: 'compact-metric-row', key },
          e('span', { className: 'compact-metric-name', title: metricNote(key) }, metricLabel(key)),
          e('span', { className: 'compact-metric-value' }, formatMetricNumber(raw[key], key)),
          e('span', { className: 'compact-metric-value corrected' }, formatMetricNumber(corrected[key], key))
        )
      )
  }

  function opsPointRows(sample, side) {
    if (!sample || String(sample.mode || '').toLowerCase() !== 'dops') return []
    return Array.from({ length: 5 }, (_item, index) => {
      const opIndex = index + 1
      return ['peak', 'valley'].map((kind) => {
        const key = `op${opIndex}-${kind}`
        const rawPoint = inferredRawOpPoint(sample, side, opIndex, kind)
        const manualPoint =
          sample.corrections && sample.corrections.manualPoints
            ? manualPicks.getManualPoint(sample.corrections.manualPoints, side, key)
            : null
        return e(
          'div',
          { className: 'compact-metric-row op-point-row', key: `${side}-${key}` },
          e('span', { className: 'compact-metric-name', title: `${key} time and amp point` }, `OP${opIndex} ${kind}`),
          e('span', { className: 'compact-metric-value', title: formatPointCell(rawPoint) }, formatPointCell(rawPoint)),
          e('span', { className: 'compact-metric-value corrected', title: formatPointCell(manualPoint) }, formatPointCell(manualPoint))
        )
      })
    }).flat()
  }

  function inferredRawOpPoint(sample, side, opIndex, kind) {
    const trace = sample && sample.traces && sample.traces[side]
    if (!trace || !Array.isArray(trace.x) || !Array.isArray(trace.y) || !trace.y.length) return null
    const windows = [
      [30, 44],
      [42, 56],
      [54, 70],
      [68, 86],
      [84, 108],
    ]
    const window = windows[opIndex - 1] || [30 + (opIndex - 1) * 12, 45 + (opIndex - 1) * 12]
    let bestIndex = -1
    trace.x.forEach((xValue, index) => {
      const x = Number(xValue)
      const y = Number(trace.y[index])
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < window[0] || x > window[1]) return
      if (bestIndex < 0) {
        bestIndex = index
        return
      }
      const current = Number(trace.y[bestIndex])
      if (kind === 'valley' ? y < current : y > current) bestIndex = index
    })
    if (bestIndex < 0) return null
    return { x: trace.x[bestIndex], y: trace.y[bestIndex] }
  }

  function formatPointCell(point) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return 'NA'
    return `${formatPointValue(point.x)} ms / ${formatPointValue(point.y)} µV`
  }

  function metricReviewPriority(key, mode) {
    const normalized = String(mode || '').toLowerCase()
    const order =
      normalized === 'fvep'
        ? ['p1n1AmplitudeUv', 'p1n2AmplitudeUv', 'p2n2AmplitudeUv', 'n1LatencyMs', 'p1LatencyMs', 'n2LatencyMs', 'p2LatencyMs']
        : normalized === 'dops'
          ? ['sumOpAmplitudeUv', 'op1AmplitudeUv', 'op2AmplitudeUv', 'op3AmplitudeUv', 'op4AmplitudeUv', 'op5AmplitudeUv']
          : normalized === 'flicker'
            ? ['flickerAmplitudeUv', 'flickerWaveformAmplitudeUv', 'flickerPhaseDeg', 'flickerWaveformPhaseDeg', 'flickerImplicitTimeMs']
            : ['bAmplitudeUv', 'aAmplitudeUv', 'bLatencyMs', 'aLatencyMs']
    const index = order.indexOf(key)
    if (index >= 0) return index
    const fallback = METRICS.findIndex(([metricKey]) => metricKey === key)
    return order.length + (fallback >= 0 ? fallback : 999)
  }

  function formatValue(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : 'NA'
  }

  function formatMetricNumber(value, metricKey) {
    if (!Number.isFinite(Number(value))) return 'NA'
    return displayMetricNumberValue(value, metricKey).toFixed(metricUnit(metricKey) === 'ratio' ? 3 : 2)
  }

  function displayMetricNumberValue(value, metricKey) {
    const number = Number(value)
    if (!Number.isFinite(number)) return NaN
    return metricKey === 'aAmplitudeUv' ? Math.abs(number) : number
  }

  function formatPointValue(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : 'NA'
  }

  function toWorkbookBytes(payload) {
    if (!payload) return new Uint8Array()
    if (payload instanceof Uint8Array) return payload
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
    if (ArrayBuffer.isView(payload)) {
      return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
    }
    if (payload.type === 'Buffer' && Array.isArray(payload.data)) return Uint8Array.from(payload.data)
    if (Array.isArray(payload)) return Uint8Array.from(payload)
    return payload
  }

  function csvCell(value) {
    const text = String(value == null ? '' : value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  function matchesRecordFilter(sample, filter) {
    if (filter === 'ERG') return recordSourceType(sample) === 'ERG'
    if (filter === 'FVEP') return recordSourceType(sample) === 'FVEP'
    return true
  }

  function availableRecordFilters(samples) {
    return FILTERS.filter((filter) => (samples || []).some((sample) => matchesRecordFilter(sample, filter)))
  }

  function effectiveRecordFilter(filter, samples) {
    if (['ERG', 'FVEP'].includes(filter) && (samples || []).some((sample) => matchesRecordFilter(sample, filter))) {
      return filter
    }
    const available = availableRecordFilters(samples)
    return available[0] || 'ERG'
  }

  function acquisitionCategoryOptions(samples) {
    const groups = groupByAcquisitionCategory(samples)
    return groups.map(({ key, label }) => ({ key, label }))
  }

  function groupByAcquisitionCategory(samples, filter) {
    const groups = new Map()
    ;(samples || []).forEach((sample) => {
      const category = acquisitionCategory(sample, filter)
      const current = groups.get(category.key) || { ...category, records: [] }
      current.records.push(sample)
      groups.set(category.key, current)
    })
    return Array.from(groups.values()).sort((left, right) => {
      const leftIndex = ACQUISITION_CATEGORY_ORDER.indexOf(left.key)
      const rightIndex = ACQUISITION_CATEGORY_ORDER.indexOf(right.key)
      const leftRank = leftIndex === -1 ? ACQUISITION_CATEGORY_ORDER.length : leftIndex
      const rightRank = rightIndex === -1 ? ACQUISITION_CATEGORY_ORDER.length : rightIndex
      return leftRank - rightRank || left.label.localeCompare(right.label)
    })
  }

  function acquisitionCategory(sample, filter) {
    if (recordSourceType(sample) === 'FVEP') {
      const label = fvepAcquisitionModeLabel(sample)
      return { key: `FVEP:${label}`, label }
    }
    const mode = String((sample && sample.mode) || '')
    const condition = String((sample && sample.condition) || '')
    const metadata = sample && sample.metadata ? sample.metadata : {}
    const text = `${mode} ${condition} ${metadata.rightName || ''} ${metadata.leftName || ''}`.toLowerCase()
    if (/(^|\W)dops(\W|$)|(^|\W)ops(\W|$)|op\d/.test(text)) return { key: 'OPs', label: 'OPs' }
    if (/flicker|iflicker|闪烁/.test(text)) return { key: 'Flicker', label: 'Flicker' }
    if (/drod|(^|\W)rod(\W|$)|暗适应.*0\.01/.test(text)) return { key: 'Rod', label: 'Rod' }
    if (/dmax|(^|\W)max(\W|$)|暗适应.*3\.0/.test(text)) return { key: 'Max', label: 'Max' }
    if (/[li]cone|(^|\W)cone(\W|$)|明适应/.test(text)) return { key: 'Cone', label: 'Cone' }
    return {
      key: filter === 'ERG' || recordSourceType(sample) === 'ERG' ? 'Other' : recordSourceType(sample),
      label: filter === 'ERG' || recordSourceType(sample) === 'ERG' ? 'Other ERG' : recordSourceType(sample),
    }
  }

  function fvepAcquisitionModeLabel(sample) {
    const condition = String((sample && sample.condition) || '').trim()
    const mode = String((sample && sample.mode) || '').trim()
    const metadata = sample && sample.metadata ? sample.metadata : {}
    const text = `${condition} ${mode} ${metadata.rightName || ''} ${metadata.leftName || ''}`
    const hzMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*hz/i)
    if (/steady[-\s]?state/i.test(text) || hzMatch) {
      return hzMatch ? `Steady-state ${formatCompactNumber(Number(hzMatch[1]))} Hz` : 'Steady-state VEP'
    }
    const patternMatch = text.match(/pattern(?:\s+reversal|\s+onset|\s+offset)?/i)
    if (patternMatch) return capitalizeLabel(patternMatch[0])
    if (/flash|标闪|闪光|白光|fvep|vep/i.test(text)) return 'Flash VEP'
    return mode && mode.toLowerCase() !== 'fvep' ? mode : conditionShortLabel(condition || 'Flash VEP')
  }

  function conditionShortLabel(value) {
    return String(value || 'Stimulus')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 18)
  }

  function capitalizeLabel(value) {
    const text = String(value || '').replace(/[-_]+/g, ' ').trim()
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : 'Mode'
  }

  function recordProtocolLabel(sample) {
    const category = acquisitionCategory(sample)
    return category.label === 'Other ERG' ? sample.mode || 'ERG' : category.label
  }

  function acquisitionFilename(sample) {
    const sourcePath = sample && sample.metadata ? sample.metadata.sourcePath : ''
    return fileNameFromPath(sourcePath || sample?.sourceName || 'Unknown source').replace(/\.(xlsx|xls)$/i, '')
  }

  function acquisitionNumberLabel(sample) {
    const category = acquisitionCategory(sample)
    const prefix =
      recordSourceType(sample) === 'FVEP'
        ? 'FVEP'
        : category.key === 'OPs'
          ? 'OPs'
          : category.key === 'Flicker'
            ? 'Flicker'
            : 'FERG'
    return [prefix, sample && sample.acquisitionId ? sample.acquisitionId : '']
      .filter(Boolean)
      .join(' ')
  }

  function sampleEyeLabel(sample) {
    const traces = sample && sample.traces ? sample.traces : {}
    const hasRight = hasTrace(traces.right)
    const hasLeft = hasTrace(traces.left)
    if (hasRight && hasLeft) return 'OS/OD'
    if (hasRight) return 'OD'
    if (hasLeft) return 'OS'
    return 'NA'
  }

  function buildAnalysisDataMatrix(project, rows, metricKey) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const sampleMap = new Map(samples.map((sample) => [sample.id, sample]))
    const rowItems = Array.isArray(rows) ? rows : []
    const stimulusMap = new Map()
    rowItems.forEach((row) => {
      if (!row || !row.condition || stimulusMap.has(row.condition)) return
      stimulusMap.set(row.condition, {
        key: row.condition,
        label: summaryConditionLabel(row),
        shortLabel: analysisStimulusColumnLabel(row),
        condition: row.condition,
        stimulusValue: row.stimulusValue,
        protocolIndex: row.protocolIndex,
      })
    })
    const stimuli = Array.from(stimulusMap.values()).sort((left, right) =>
      conditionSort(left.condition, right.condition, rowItems)
    )
    const buckets = new Map()
    rowItems.forEach((row) => {
      const sample = sampleMap.get(row.sampleId)
      if (!sample) return
      analysisMatrixEyes(sample).forEach((eye) => {
        const key = `${row.subjectId || row.sample || sample.subjectId || sample.id}||${eye.label}`
        if (!buckets.has(key)) {
          buckets.set(key, {
            key,
            name: row.subjectId || sample.subjectId || row.sample || sample.label || sample.id,
            eye: eye.label,
            eyeSide: eye.side,
            sampleIds: new Set(),
            includedStates: [],
            values: {},
            sortName: row.subjectId || sample.subjectId || row.sample || sample.label || sample.id,
            sortEye: eye.label,
          })
        }
        const bucket = buckets.get(key)
        bucket.sampleIds.add(row.sampleId)
        bucket.includedStates.push(row.included !== false && isAnalysisEyeIncluded(sample, eye.side))
        const value = analysisMatrixMetricValue(sample, metricKey || row.metric, row.version, eye.side)
        const conditionKey = row.condition || 'All'
        if (!bucket.values[conditionKey]) bucket.values[conditionKey] = { values: [], sources: [] }
        if (Number.isFinite(Number(value))) bucket.values[conditionKey].values.push(Number(value))
        bucket.values[conditionKey].sources.push(row.sampleId)
      })
    })
    const matrixRows = Array.from(buckets.values())
      .map((row) => {
        const states = row.includedStates
        const allIn = states.length ? states.every(Boolean) : true
        const allOut = states.length ? states.every((state) => !state) : false
        const state = allIn ? 'In' : allOut ? 'Out' : 'Mixed'
        const values = {}
        Object.entries(row.values).forEach(([condition, cell]) => {
          const finite = (cell.values || []).filter(Number.isFinite)
          const averaged = finite.length
            ? finite.reduce((sum, value) => sum + value, 0) / finite.length
            : NaN
          values[condition] = {
            text: Number.isFinite(averaged) ? formatMetricNumber(averaged, metricKey) : 'NA',
            title: finite.length > 1 ? `${finite.length} records averaged` : '',
          }
        })
        return {
          ...row,
          sampleIds: Array.from(row.sampleIds),
          state,
          nextIncluded: state !== 'In',
          values,
        }
      })
      .sort((left, right) => left.sortName.localeCompare(right.sortName) || left.sortEye.localeCompare(right.sortEye))
    return { stimuli, rows: matrixRows }
  }

  function analysisStimulusColumnLabel(row) {
    if (row && Number.isFinite(Number(row.stimulusValue))) return formatCompactNumber(Number(row.stimulusValue))
    const label = summaryConditionLabel(row)
    const parsed = parseConditionLabel(row && row.condition)
    if (Number.isFinite(Number(parsed.stimulusValue))) return formatCompactNumber(Number(parsed.stimulusValue))
    return label
  }

  function analysisMatrixEyes(sample) {
    const traces = sample && sample.traces ? sample.traces : {}
    const hasRight = hasTrace(traces.right)
    const hasLeft = hasTrace(traces.left)
    if (hasRight && hasLeft) {
      return [
        { side: 'right', label: 'OD' },
        { side: 'left', label: 'OS' },
      ]
    }
    if (hasRight) return [{ side: 'right', label: 'OD' }]
    if (hasLeft) return [{ side: 'left', label: 'OS' }]
    return [{ side: 'average', label: 'NA' }]
  }

  function analysisMatrixMetricValue(sample, metricKey, version, side) {
    if (!sample || !metricKey) return NaN
    if (!isAnalysisEyeIncluded(sample, side)) return NaN
    const scopedSample = side === 'average' ? sample : sampleForMatrixEye(sample, side)
    const raw = side === 'average'
      ? (sample.metrics && sample.metrics.raw) || metrics.deriveRawMetrics(sample)
      : metrics.deriveRawMetrics(scopedSample)
    const manual = metrics.deriveManualMetrics(raw, { ...scopedSample.corrections, mode: sample.mode })
    const values = version === 'manual' ? manual : raw
    return displayMetricNumberValue(values && values[metricKey], metricKey)
  }

  function isAnalysisEyeIncluded(sample, side) {
    if (!sample || sample.included === false) return false
    if (side !== 'right' && side !== 'left') {
      return isAnalysisEyeIncluded(sample, 'right') || isAnalysisEyeIncluded(sample, 'left')
    }
    const excludedEyes = sample.corrections && sample.corrections.excludedEyes ? sample.corrections.excludedEyes : {}
    return excludedEyes[side] !== true
  }

  function sampleForMatrixEye(sample, side) {
    const traces = sample && sample.traces ? sample.traces : {}
    const marks = sample && sample.machineMarks ? sample.machineMarks : {}
    const manual = sample && sample.corrections && sample.corrections.manualPoints
    const other = side === 'left' ? 'right' : 'left'
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
        ignoredEye: other,
      },
    }
  }

  function displayConditionLabel(sample) {
    const condition = String((sample && sample.condition) || '').trim()
    const parts = condition
      .split(/\s+·\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
    const stimulus = parts[1] || condition
    const match = stimulus.match(/([bf]?)白色光:\s*([+-]?\d+(?:\.\d+)?)([^,，]*)[,，]\s*([+-]?\d+(?:\.\d+)?)\s*ms/i)
    if (match) {
      const adaptation = match[1] === 'b' ? 'scotopic ' : match[1] === 'f' ? 'photopic ' : ''
      const intensity = formatCompactNumber(Number(match[2]))
      const unit = displayStimulusUnit(match[3])
      const duration = formatCompactNumber(Number(match[4]))
      return `${adaptation}white light: ${intensity} ${unit}, ${duration} ms`.trim()
    }
    return normalizeDisplayCondition(stimulus || condition)
  }

  function displayStimulusUnit(value) {
    const text = String(value || '').replace(/\s+/g, '')
    if (/cd\.?s\/?m-?2|cd·s\/m/.test(text)) return 'cd·s·m⁻²'
    if (/cd\.?m-?2|cd\/m2|cd·m/.test(text)) return 'cd·m⁻²'
    return text || 'cd·m⁻²'
  }

  function normalizeDisplayCondition(value) {
    return String(value || 'Stimulus')
      .replace(/白色光:/g, 'white light: ')
      .replace(/cd\.s\/m2/gi, 'cd·s·m⁻²')
      .replace(/cd\.m-2/gi, 'cd·m⁻²')
      .replace(/cd\/m2/gi, 'cd·m⁻²')
      .replace(/,\s*([0-9.]+)\s*ms(?:\s*flash)?/gi, ', $1 ms')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function buildQaStateSnapshot({
    activeStep,
    project,
    selectedSample,
    visibleSamples,
    sourceRows,
    analysisResult,
    reportResult,
    reportPackage,
    canExportWorkbook,
  }) {
    const samples = Array.isArray(project && project.samples) ? project.samples : []
    const sources = Array.isArray(project && project.sources) ? project.sources : []
    const analysisSourceRows =
      analysisResult && Array.isArray(analysisResult.sourceRows) ? analysisResult.sourceRows : []
    const reportSourceRows = reportResult && Array.isArray(reportResult.sourceRows) ? reportResult.sourceRows : []
    const scopes = reportPackage && Array.isArray(reportPackage.scopes) ? reportPackage.scopes : []

    return {
      activeStep,
      projectTitle: project && project.title ? project.title : '',
      projectFilePath: project && project.projectFilePath ? project.projectFilePath : '',
      projectSavedAt: project && project.savedAt ? project.savedAt : '',
      records: samples.length,
      sources: sources.length,
      visibleRecords: Array.isArray(visibleSamples) ? visibleSamples.length : 0,
      selectedSampleId: selectedSample ? selectedSample.id || '' : '',
      selectedMode: selectedSample ? selectedSample.mode || '' : '',
      sourceRows: Array.isArray(sourceRows) ? sourceRows.length : 0,
      analysisSourceRows: analysisSourceRows.length,
      analysisWarnings:
        analysisResult && Array.isArray(analysisResult.warnings) ? analysisResult.warnings.length : 0,
      reportSourceRows: reportSourceRows.length,
      reportScopes: scopes.map((scope) => ({
        id: scope.id || '',
        records: Number(scope.records) || 0,
        readyFigures: Number(scope.readyFigures) || 0,
        totalFigures: Number(scope.totalFigures) || 0,
      })),
      layout: buildQaLayoutSnapshot(),
      surface: buildQaSurfaceSnapshot(),
      canExportWorkbook: Boolean(canExportWorkbook),
      gates: {
        hasSelectedSample: Boolean(selectedSample),
        canReview: Boolean(selectedSample),
        canCopyAnalysisCsv: Array.isArray(sourceRows) && sourceRows.length > 0,
        canExportWorkbook: Boolean(canExportWorkbook),
        canExportPdf: reportSourceRows.length > 0,
      },
    }
  }

  function qaExpectedSourceNamesReady(sources, expectedSourceNames) {
    const expected = String(expectedSourceNames || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
    if (!expected.length) return true
    const haystack = (Array.isArray(sources) ? sources : [])
      .flatMap((source) => [source.name, source.path, source.key])
      .map((value) => String(value || '').toLowerCase())
    return expected.every((name) => {
      const normalized = name.toLowerCase()
      return haystack.some((value) => value.includes(normalized))
    })
  }

  function buildQaSurfaceSnapshot() {
    if (typeof document === 'undefined') {
      return { panels: [], tabs: [], toolbarActions: [], filters: [], reportScopes: [], tableHeaders: [] }
    }
    return {
      panels: textList('.panel-title'),
      tabs: visibleElements('.tabs button').map((element) => ({
        text: textSnippet(element.textContent || ''),
        active: element.classList.contains('active'),
      })),
      toolbarActions: textList('.toolbar-actions button'),
      filters: textList('.filter-chip'),
      acquisitionCategories: visibleElements('.acquisition-category-header').map((element) =>
        textSnippet((element.querySelector('span') || element).textContent || '')
      ),
      acquisitionHeaders: textList('.acquisition-record-head span'),
      acquisitionRecords: visibleElements('.acquisition-record-row:not(.acquisition-record-head)').map((row) =>
        visibleElementsIn(row, '.acquisition-select-action, span, button').map((cell) =>
          textSnippet(cell.textContent || cell.value || '')
        )
      ),
      reportScopes: textList('.report-scope-options button'),
      tableHeaders: textList('th'),
      analysisControls: labeledControlSurface('.analysis-control'),
      reviewControls: labeledControlSurface('.review-select'),
    }
  }

  function labeledControlSurface(selector) {
    return visibleElements(selector).map((row) => ({
      label: textSnippet(row.querySelector('span, label')?.textContent || ''),
      value: row.querySelector('select, input')?.value || '',
    }))
  }

  function afterNextLayoutFrame() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    })
  }

  function buildQaLayoutSnapshot() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return { viewport: {}, controls: [], panels: [], issues: ['document-unavailable'] }
    }
    const issues = []
    const root = document.documentElement
    const body = document.body
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      clientWidth: root ? root.clientWidth : 0,
      clientHeight: root ? root.clientHeight : 0,
      bodyScrollWidth: body ? body.scrollWidth : 0,
      bodyScrollHeight: body ? body.scrollHeight : 0,
    }

    if (viewport.clientWidth && viewport.width - viewport.clientWidth > 1) issues.push('visible-vertical-scrollbar')
    if (viewport.clientHeight && viewport.height - viewport.clientHeight > 1) issues.push('visible-horizontal-scrollbar')
    if (viewport.bodyScrollWidth > viewport.width + 1) issues.push('body-horizontal-overflow')
    if (viewport.bodyScrollHeight > viewport.height + 1) issues.push('body-vertical-overflow')

    const singleLineControls = visibleElements(
      [
        'button:not(.acquisition-select-action):not(.row-action)',
        'select',
        'input',
        '.pill',
        '.source-count',
        '.record-count',
        '.source-badge',
        '.filter-chip',
        '.panel-action',
      ].join(',')
    )
    const controls = singleLineControls.map((element) => summarizeLayoutElement(element))
    const badHeights = controls.filter((control) => control.height && Math.abs(control.height - 30) > 1)
    badHeights.slice(0, 8).forEach((control) => {
      issues.push(`control-height:${control.selector}:${control.height}`)
    })

    const clippedControls = controls.filter((control) => control.text && control.textOverflowX > 1)
    clippedControls.slice(0, 8).forEach((control) => {
      issues.push(`control-text-overflow:${control.selector}:${control.text}`)
    })

    const panels = visibleElements('.panel').map((element) => summarizeLayoutElement(element))
    panels
      .filter((panel) => panel.width < 120 || panel.height < 38)
      .slice(0, 6)
      .forEach((panel) => issues.push(`panel-too-small:${panel.selector}:${panel.width}x${panel.height}`))

    const panelHeaders = visibleElements('.panel-header')
    panelHeaders.forEach((header) => {
      const title = header.querySelector('.panel-title')
      const trailing = header.lastElementChild
      if (!title || !trailing || title === trailing) return
      const titleRect = title.getBoundingClientRect()
      const trailingRect = trailing.getBoundingClientRect()
      if (rectsOverlap(titleRect, trailingRect)) {
        issues.push(`panel-header-overlap:${textSnippet(title.textContent)}:${textSnippet(trailing.textContent)}`)
      }
    })

    const layoutControls = visibleElements('button, select, input, .pill, .panel-action')
      .filter((element) => !element.closest('.plot'))
      .map((element) => ({ element, rect: element.getBoundingClientRect(), selector: elementSelector(element) }))
    for (let index = 0; index < layoutControls.length; index += 1) {
      for (let next = index + 1; next < layoutControls.length; next += 1) {
        const left = layoutControls[index]
        const right = layoutControls[next]
        if (left.element.contains(right.element) || right.element.contains(left.element)) continue
        if (rectsOverlap(left.rect, right.rect)) {
          issues.push(`control-overlap:${left.selector}:${right.selector}`)
          if (issues.length > 18) break
        }
      }
      if (issues.length > 18) break
    }

    const verticalStacks = inspectIntakeVerticalStacks(issues)
    inspectSingleLineRows(issues)
    inspectAnalysisMatrix(issues)
    inspectInspectorFields(issues)
    inspectVisibleStimulusLabels(issues)
    const designAudit = buildQaDesignAuditSnapshot(issues)

    return {
      viewport,
      controls,
      panels,
      panelHeaders: panelHeaders.length,
      verticalStacks,
      designAudit,
      issues,
    }
  }

  function visibleElements(selector) {
    return Array.from(document.querySelectorAll(selector)).filter((element) => isVisibleLayoutElement(element))
  }

  function inspectSingleLineRows(issues) {
    const selectors = ['.cohort-setup-row', '.acquisition-record-row']
    selectors.forEach((selector) => {
      visibleElements(selector).forEach((row, rowIndex) => {
        const rowRect = row.getBoundingClientRect()
        if ((row.scrollHeight || 0) > (row.clientHeight || 0) + 1) {
          issues.push(`single-line-row-overflow:${selector}:${rowIndex}`)
        }
        const children = Array.from(row.children).filter((child) => isVisibleLayoutElement(child))
        children.forEach((child, childIndex) => {
          const rect = child.getBoundingClientRect()
          if (rect.top < rowRect.top - 1 || rect.bottom > rowRect.bottom + 1) {
            issues.push(`single-line-row-wrap:${selector}:${rowIndex}:${childIndex}`)
          }
        })
      })
    })
  }

  function inspectAnalysisMatrix(issues) {
    visibleElements('.analysis-matrix-table tbody tr').forEach((row, rowIndex) => {
      const cells = Array.from(row.children).filter((cell) => isVisibleLayoutElement(cell))
      if (cells.length < 4) return
      const valueCell = cells[cells.length - 2]
      const stateCell = cells[cells.length - 1]
      const valueRect = valueCell.getBoundingClientRect()
      const stateRect = stateCell.getBoundingClientRect()
      if (valueRect.right > stateRect.left + 1) {
        issues.push(`analysis-state-overlap:${rowIndex}`)
      }
    })
  }

  function inspectInspectorFields(issues) {
    const grid = document.querySelector('.field-grid')
    if (!grid || !isVisibleLayoutElement(grid)) return
    const gridWidth = grid.getBoundingClientRect().width
    visibleElements('.field-grid .field').forEach((field) => {
      const label = textSnippet(field.querySelector('label') ? field.querySelector('label').textContent : '')
      if (!['Filename', 'Stimulus'].includes(label)) return
      const rect = field.getBoundingClientRect()
      if (!field.classList.contains('wide') || rect.width < gridWidth - 2) {
        issues.push(`metadata-wide-field-not-spanning:${label}:${Math.round(rect.width)}/${Math.round(gridWidth)}`)
      }
    })
  }

  function inspectVisibleStimulusLabels(issues) {
    visibleStimulusTexts()
      .filter((value) => /\bflash\b/i.test(value))
      .slice(0, 6)
      .forEach((value) => issues.push(`stimulus-flash-label:${value}`))
  }

  function summarizeLayoutElement(element) {
    const rect = element.getBoundingClientRect()
    return {
      selector: elementSelector(element),
      text: textSnippet(element.textContent || element.value || ''),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      textOverflowX: Math.max(0, Math.round((element.scrollWidth || 0) - (element.clientWidth || 0))),
      textOverflowY: Math.max(0, Math.round((element.scrollHeight || 0) - (element.clientHeight || 0))),
    }
  }

  function buildQaDesignAuditSnapshot(issues) {
    const workspace = document.querySelector('.workspace') || document.body
    const textElements = visibleElementsIn(
      workspace,
      [
        '.panel-title',
        '.stat-label',
        '.stat-value',
        '.snapshot-item span',
        '.snapshot-item strong',
        '.analysis-control span',
        '.cohort-file-cell span',
        '.cohort-type-cell',
        '.report-row span',
        '.report-row strong',
        'button',
        'select',
        'input',
        '.pill',
        '.source-count',
        '.record-count',
        '.source-badge',
        '.filter-chip',
        'td',
        'th',
      ].join(',')
    ).filter((element) => !element.closest('svg'))
    const textStyles = textElements.map((element) => ({
      selector: elementSelector(element),
      text: textSnippet(element.textContent || element.value || ''),
      ...computedTextStyle(element),
    }))
    const fontSizes = uniqueSorted(textStyles.map((style) => style.fontSize).filter(Boolean), numericPxSort)
    const fontWeights = uniqueSorted(textStyles.map((style) => style.fontWeight).filter(Boolean), numericStringSort)

    if (fontSizes.length > 4) {
      issues.push(`design-font-size-scale:${fontSizes.join(',')}`)
    }

    const panelTitles = visibleElements('.panel-title').map((element) => ({
      text: textSnippet(element.textContent || ''),
      ...computedTextStyle(element),
    }))
    const panelHeaderPairs = visibleElements('.panel-header')
      .map((header) => {
        const title = header.querySelector('.panel-title')
        const trailing = header.lastElementChild
        if (!title || !isVisibleLayoutElement(title)) return null
        return {
          title: summarizeTextElement(title),
          trailing:
            trailing && trailing !== title && isVisibleLayoutElement(trailing)
              ? summarizeDesignControl(trailing)
              : null,
        }
      })
      .filter(Boolean)
    const panelTitleStyles = uniqueSorted(
      panelTitles.map((title) => `${title.fontSize}/${title.fontWeight}`).filter(Boolean)
    )
    if (panelTitleStyles.length > 1) {
      issues.push(`design-panel-title-style:${panelTitleStyles.join(',')}`)
    }
    panelTitles
      .filter((title) => !title.text)
      .slice(0, 3)
      .forEach(() => issues.push('design-panel-title-empty'))

    const headerControls = visibleElements('.panel-header')
      .map((header) => {
        const title = header.querySelector('.panel-title')
        const trailing = header.lastElementChild
        if (!trailing || trailing === title || !isVisibleLayoutElement(trailing)) return null
        return summarizeDesignControl(trailing)
      })
      .filter(Boolean)
    headerControls
      .filter((control) => control.height && Math.abs(control.height - 30) > 1)
      .slice(0, 4)
      .forEach((control) => issues.push(`design-header-control-height:${control.selector}:${control.height}`))

    const formControls = visibleElements(
      [
        'button:not(.acquisition-select-action):not(.row-action)',
        'select',
        'input',
        '.pill',
        '.source-count',
        '.record-count',
        '.source-badge',
        '.filter-chip',
        '.panel-action',
      ].join(',')
    ).map(summarizeDesignControl)
    const controlHeights = uniqueSorted(formControls.map((control) => String(control.height)).filter(Boolean), numericStringSort)
    const controlRadii = uniqueSorted(formControls.map((control) => control.borderRadius).filter(Boolean), numericPxSort)
    const controlFontSizes = uniqueSorted(formControls.map((control) => control.fontSize).filter(Boolean), numericPxSort)
    if (controlHeights.length > 2 || !controlHeights.includes('30')) {
      issues.push(`design-control-heights:${controlHeights.join(',')}`)
    }
    if (controlFontSizes.length > 1 || controlFontSizes[0] !== '12px') {
      const mismatched = formControls
        .filter((control) => control.fontSize !== '12px')
        .slice(0, 6)
        .map((control) => `${control.selector}:${control.text}:${control.fontSize}`)
      issues.push(`design-control-font-sizes:${controlFontSizes.join(',')}:${mismatched.join('|')}`)
    }
    if (controlRadii.length > 2) {
      issues.push(`design-control-radii:${controlRadii.join(',')}`)
    }

    return {
      fontSizes,
      fontWeights,
      panelTitleStyles,
      panelTitles: panelTitles.slice(0, 16),
      panelHeaderPairs: panelHeaderPairs.slice(0, 32),
      headerControls: headerControls.slice(0, 24),
      formControls: formControls.slice(0, 220),
      formControlSummary: {
        count: formControls.length,
        heights: controlHeights,
        radii: controlRadii,
        fontSizes: controlFontSizes,
      },
    }
  }

  function summarizeTextElement(element) {
    const rect = element.getBoundingClientRect()
    return {
      selector: elementSelector(element),
      text: textSnippet(element.textContent || element.value || ''),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      ...computedTextStyle(element),
    }
  }

  function summarizeDesignControl(element) {
    const rect = element.getBoundingClientRect()
    const computed = window.getComputedStyle(element)
    return {
      selector: elementSelector(element),
      text: textSnippet(element.textContent || element.value || ''),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      borderRadius: computed.borderRadius,
      ...computedTextStyle(element),
    }
  }

  function computedTextStyle(element) {
    const computed = window.getComputedStyle(element)
    return {
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fontFamily: computed.fontFamily,
      lineHeight: computed.lineHeight,
    }
  }

  function uniqueSorted(values, sortFn) {
    const list = Array.from(new Set((values || []).filter(Boolean)))
    return sortFn ? list.sort(sortFn) : list.sort()
  }

  function numericPxSort(left, right) {
    return Number.parseFloat(left) - Number.parseFloat(right)
  }

  function numericStringSort(left, right) {
    return Number(left) - Number(right)
  }

  function inspectIntakeVerticalStacks(issues) {
    return [
      ...inspectVerticalStack(
        {
          name: 'intake-grid',
          stack: '.intake-grid',
          items: ['.intake-project-panel', '.intake-split-grid'],
        },
        issues
      ),
      ...inspectIntakeSplitGrid(issues),
    ]
  }

  function inspectIntakeSplitGrid(issues) {
    const stack = document.querySelector('.intake-split-grid')
    if (!stack || !isVisibleLayoutElement(stack)) return []
    const stackRect = stack.getBoundingClientRect()
    const items = ['.intake-cohort-panel', '.intake-record-panel']
      .map((selector) => ({ selector, element: document.querySelector(selector) }))
      .filter(({ element }) => element && isVisibleLayoutElement(element))
      .map(({ selector, element }) => {
        const rect = element.getBoundingClientRect()
        const scrollElement = selector === '.intake-cohort-panel' ? element.querySelector('.cohort-setup-list') : element
        return {
          selector,
          rect,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollHeight: (scrollElement && scrollElement.scrollHeight) || 0,
          clientHeight: (scrollElement && scrollElement.clientHeight) || 0,
        }
      })
    const cohortPanel = items.find((item) => item.selector === '.intake-cohort-panel')
    const recordPanel = items.find((item) => item.selector === '.intake-record-panel')
    if (!cohortPanel || !recordPanel) {
      issues.push('intake-split-missing-panel')
    } else {
      if (Math.abs(cohortPanel.width - recordPanel.width) > 8) {
        issues.push(`intake-split-width-mismatch:${cohortPanel.width}:${recordPanel.width}`)
      }
      if (rectsOverlap(cohortPanel.rect, recordPanel.rect)) {
        issues.push('intake-split-panel-overlap')
      }
      if (recordPanel.height < 220) {
        issues.push(`intake-record-too-short:${recordPanel.height}`)
      }
    }
    items.forEach((item) => {
      if (item.rect.bottom > stackRect.bottom + 1) {
        issues.push(`intake-split-overflow:${item.selector}`)
      }
    })
    return [
      {
        name: 'intake-split',
        height: Math.round(stackRect.height),
        items: items.map((item) => ({
          selector: item.selector,
          width: item.width,
          height: item.height,
          scrollOverflowY: Math.max(0, Math.round(item.scrollHeight - item.clientHeight)),
        })),
      },
    ]
  }

  function inspectVerticalStack(config, issues) {
    const stack = document.querySelector(config.stack)
    if (!stack) return []
    const stackRect = stack.getBoundingClientRect()
    const items = config.items
      .map((selector) => ({ selector, element: document.querySelector(selector) }))
      .filter(({ element }) => element && isVisibleLayoutElement(element))
      .map(({ selector, element }) => {
        const rect = element.getBoundingClientRect()
        const scrollElement = selector === '.intake-cohort-panel' ? element.querySelector('.cohort-setup-list') : element
        return {
          selector,
          rect,
          height: Math.round(rect.height),
          scrollHeight: (scrollElement && scrollElement.scrollHeight) || 0,
          clientHeight: (scrollElement && scrollElement.clientHeight) || 0,
        }
      })

    for (let index = 0; index < items.length - 1; index += 1) {
      const current = items[index]
      const next = items[index + 1]
      if (rectsOverlap(current.rect, next.rect)) {
        issues.push(`vertical-stack-overlap:${config.name}:${current.selector}:${next.selector}`)
      }
      if (next.rect.top < current.rect.bottom - 1) {
        issues.push(`vertical-stack-order:${config.name}:${current.selector}:${next.selector}`)
      }
    }

    items.forEach((item) => {
      if (item.rect.bottom > stackRect.bottom + 1) {
        issues.push(`vertical-stack-overflow:${config.name}:${item.selector}`)
      }
    })

    const cohortBody = document.querySelector('.cohort-setup-list')
    if (cohortBody && isVisibleLayoutElement(cohortBody)) {
      const hasOverflow = cohortBody.scrollHeight > cohortBody.clientHeight + 1
      if (hasOverflow && cohortBody.clientHeight < 140) {
        issues.push(`intake-cohort-scroll-area-too-small:${cohortBody.clientHeight}`)
      }
    }

    return [
      {
        name: config.name,
        height: Math.round(stackRect.height),
        items: items.map((item) => ({
          selector: item.selector,
          height: item.height,
          scrollOverflowY: Math.max(0, Math.round(item.scrollHeight - item.clientHeight)),
        })),
      },
    ]
  }

  function isVisibleLayoutElement(element) {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return false
    const visibleRect = clippedLayoutRect(element, rect)
    return visibleRect.width > 1 && visibleRect.height > 1
  }

  function clippedLayoutRect(element, rect) {
    const clipped = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
    let parent = element.parentElement
    while (parent && parent !== document.documentElement) {
      const style = window.getComputedStyle(parent)
      const overflow = `${style.overflow || ''} ${style.overflowX || ''} ${style.overflowY || ''}`
      if (/(auto|scroll|hidden|clip)/.test(overflow)) {
        const parentRect = parent.getBoundingClientRect()
        clipped.left = Math.max(clipped.left, parentRect.left)
        clipped.top = Math.max(clipped.top, parentRect.top)
        clipped.right = Math.min(clipped.right, parentRect.right)
        clipped.bottom = Math.min(clipped.bottom, parentRect.bottom)
      }
      parent = parent.parentElement
    }
    clipped.width = Math.max(0, clipped.right - clipped.left)
    clipped.height = Math.max(0, clipped.bottom - clipped.top)
    return clipped
  }

  function elementSelector(element) {
    const tag = String(element.tagName || '').toLowerCase()
    const classes = String(element.className || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join('.')
    return classes ? `${tag}.${classes}` : tag
  }

  function textSnippet(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64)
  }

  function rectsOverlap(left, right) {
    const width = Math.min(left.right, right.right) - Math.max(left.left, right.left)
    const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
    return width > 1 && height > 1
  }

  async function runQaInteractionSmoke() {
    const cases = []
    const run = async (name, expected, beforeFn, actionFn, actualFn) => {
      const before = safeQaValue(beforeFn)
      try {
        console.log('[qa] interaction case starting', name)
        await actionFn()
        await afterNextLayoutFrame()
        const actual = safeQaValue(() => actualFn(before))
        cases.push({
          name,
          expected,
          before,
          actual,
          pass: Boolean(actual && actual.pass),
        })
        console.log('[qa] interaction case completed', name, Boolean(actual && actual.pass))
      } catch (error) {
        cases.push({
          name,
          expected,
          before,
          actual: { pass: false, error: error && error.message ? error.message : String(error) },
          pass: false,
        })
        console.log('[qa] interaction case failed', name, error && error.message ? error.message : String(error))
      }
    }

    await run(
      'topbar-review-tab',
      'Clicking Review opens the Review workspace.',
      () => activeTabText(),
      () => clickButtonByText('Review', '.tabs'),
      () => ({
        pass: activeTabText() === 'Review' && Boolean(document.querySelector('.review-panel')),
        activeTab: activeTabText(),
        reviewPanel: Boolean(document.querySelector('.review-panel')),
      })
    )

    await run(
      'topbar-workflow-tab-cycle',
      'Clicking Intake, Analysis, Report, and Review switches to each workspace in order.',
      () => activeTabText(),
      async () => {
        for (const step of ['Intake', 'Analysis', 'Report', 'Review']) {
          await clickButtonByText(step, '.tabs')
          await afterNextLayoutFrame()
        }
      },
      () => ({
        pass: activeTabText() === 'Review' && Boolean(document.querySelector('.review-panel')),
        activeTab: activeTabText(),
        tabs: textList('.tabs button'),
      })
    )

    await run(
      'topbar-quit-entry-visible',
      'The top toolbar exposes a visible quit action backed by the secure quit IPC.',
      () => Boolean(window.ergAPI && window.ergAPI.quit),
      () => {},
      () => ({
        pass:
          buttonEnabledByText('Quit', '.toolbar-actions') === true &&
          Boolean(window.ergAPI && window.ergAPI.quit),
        quitButtonEnabled: buttonEnabledByText('Quit', '.toolbar-actions'),
        quitApi: Boolean(window.ergAPI && window.ergAPI.quit),
      })
    )

    await run(
      'intake-source-select',
      'Clicking a Samples file row scopes Acquisition to that source file.',
      () => activeCohortSourceText(),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        const rows = visibleElements('.cohort-setup-row.cohort-setup-data')
        if (!rows.length) throw new Error('Samples source rows were not visible.')
        const target = rows.find((row) => !row.classList.contains('active')) || rows[0]
        target.click()
      },
      (before) => {
        const value = activeCohortSourceText()
        const activeRow = visibleElements('.cohort-setup-row.cohort-setup-data.active')[0]
        return {
          pass: Boolean(activeRow) && Boolean(value) && (value !== before || visibleElements('.cohort-setup-row.cohort-setup-data').length === 1),
          before,
          activeSource: value,
          visibleRows: visibleElements('.acquisition-record-row:not(.acquisition-record-head)').length,
        }
      }
    )

    await run(
      'intake-category-switch',
      'Clicking an Acquisition mode/category chip changes the displayed record subset.',
      () => activeFilterText(),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        const sourceRows = visibleElements('.cohort-setup-row.cohort-setup-data')
        const ergSource =
          sourceRows.find((row) => /_FERG|ERG/.test(row.textContent || '')) || sourceRows[0]
        if (ergSource) {
          ergSource.click()
          await afterNextLayoutFrame()
        }
        const chips = visibleElements('.acquisition-switch-row .filter-chip')
        const target = chips.find((chip) => !chip.classList.contains('active')) || chips[0]
        if (!target) throw new Error('No acquisition category chip was visible.')
        target.click()
      },
      (before) => ({
        pass:
          Boolean(activeFilterText()) &&
          activeFilterText() !== before &&
          visibleElements('.acquisition-record-row:not(.acquisition-record-head)').length > 0,
        before,
        activeCategory: activeFilterText(),
        visibleRows: visibleElements('.acquisition-record-row:not(.acquisition-record-head)').length,
      })
    )

    let intakeReviewSyncExpected = null
    await run(
      'intake-review-selection-sync',
      'Selecting a Samples file and Acquisition mode on Intake keeps Review name, mode, and stimulus controls synchronized.',
      () => ({ sample: activeSampleKey(), mode: activeFilterText() }),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        const sourceRows = visibleElements('.cohort-setup-row.cohort-setup-data')
        const targetSource = sourceRows.find((row) => !row.classList.contains('active')) || sourceRows[0]
        if (!targetSource) throw new Error('No Samples source row was visible.')
        targetSource.click()
        await afterNextLayoutFrame()
        const activeSource = visibleElements('.cohort-setup-row.cohort-setup-data.active')[0]
        const chips = visibleElements('.acquisition-switch-row .filter-chip')
        const targetChip = chips.find((chip) => !chip.classList.contains('active')) || chips[0]
        if (!targetChip) throw new Error('No Acquisition mode chip was visible.')
        targetChip.click()
        await afterNextLayoutFrame()
        intakeReviewSyncExpected = {
          name: activeSource && activeSource.querySelector('.cohort-name-input') ? activeSource.querySelector('.cohort-name-input').value : '',
          mode: activeFilterText(),
        }
        await clickButtonByText('Review', '.tabs')
      },
      () => {
        const values = reviewControlValues()
        return {
          pass:
            activeTabText() === 'Review' &&
            Boolean(intakeReviewSyncExpected && intakeReviewSyncExpected.name) &&
            values.Name === (intakeReviewSyncExpected && intakeReviewSyncExpected.name) &&
            values.Mode === (intakeReviewSyncExpected && intakeReviewSyncExpected.mode) &&
            Boolean(values.Stimulus) &&
            !/\bflash\b/i.test(values.Stimulus),
          expected: intakeReviewSyncExpected,
          values,
          activeSample: activeSampleKey(),
          activeTab: activeTabText(),
        }
      }
    )

    await run(
      'intake-record-select',
      'Clicking an Intake acquisition row selects it and opens Review.',
      () => activeSampleKey(),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        await clickDifferentSampleRow()
      },
      (before) => ({
        pass: Boolean(activeSampleKey()) && activeTabText() === 'Review',
        before,
        activeSample: activeSampleKey(),
        activeTab: activeTabText(),
      })
    )

    await run(
      'analysis-include-toggle',
      'Clicking an Analysis In/Out control toggles that acquisition inclusion state and updates the analysis table.',
      () => firstElementText('.analysis-data-panel .sample-include-toggle'),
      async () => {
        await clickButtonByText('Analysis', '.tabs')
        await afterNextLayoutFrame()
        await clickFirst('.analysis-data-panel .sample-include-toggle')
      },
      (before) => {
        const value = firstElementText('.analysis-data-panel .sample-include-toggle')
        return {
          pass: value === 'Out' || (Boolean(before) && value !== before),
          includeState: value,
        }
      }
    )

    await run(
      'analysis-data-matrix-shape',
      'Analysis Data displays one row per sample eye, with numeric stimulus columns and unit-free values.',
      () => textList('.analysis-data-panel th'),
      async () => {
        await clickButtonByText('Analysis', '.tabs')
        await afterNextLayoutFrame()
      },
      () => {
        const title = firstElementText('.analysis-data-panel .panel-title')
        const headers = textList('.analysis-data-panel th')
        const stimulusHeaders = headers.slice(2, -1)
        const eyeValues = textList('.analysis-data-panel tbody tr td:nth-child(2)')
        const bodyValues = textList('.analysis-data-panel tbody td')
        const stateButtons = textList('.analysis-data-panel .sample-include-toggle')
        const unitBearingValues = headers.concat(bodyValues).filter((value) => /\b[uµμ]V\b/.test(value))
        return {
          pass:
            /^DATA: [^_]+_[^_]+_.+/.test(title) &&
            headers[0] === 'Name' &&
            headers[1] === 'Eye' &&
            headers[headers.length - 1] === 'State' &&
            headers.length >= 4 &&
            stimulusHeaders.some((value) => /^-?\d+(?:\.\d+)?$/.test(value)) &&
            unitBearingValues.length === 0 &&
            eyeValues.some((value) => value === 'OD') &&
            eyeValues.some((value) => value === 'OS') &&
            stateButtons.length > 0,
          title,
          headers,
          eyeValues: eyeValues.slice(0, 6),
          stateButtons: stateButtons.slice(0, 6),
          unitBearingValues,
        }
      }
    )

    await run(
      'review-scope-selects',
      'Changing Review type/name/mode/stimulus controls updates their visible values.',
      () => reviewControlValues(),
      async () => {
        await clickButtonByText('Review', '.tabs')
        await afterNextLayoutFrame()
        const values = reviewControlValues()
        const mode = labeledControl('.review-select', 'Mode')
        const stimulus = labeledControl('.review-select', 'Stimulus')
        if (!mode || !stimulus) throw new Error('Review Mode/Stimulus selects were not visible.')
        const nextMode = Array.from(mode.options).find((option) => option.value && option.value !== mode.value)
        if (nextMode) {
          setControlValue(mode, nextMode.value)
          await afterNextLayoutFrame()
        }
        const nextStimulus = Array.from(stimulus.options).find((option) => option.value && option.value !== stimulus.value)
        if (nextStimulus) setControlValue(stimulus, nextStimulus.value)
        return values
      },
      (before) => {
        const values = reviewControlValues()
        return {
          pass:
            Boolean(values.Type) &&
            Boolean(values.Name) &&
            Boolean(values.Mode) &&
            Boolean(values.Stimulus) &&
            !visibleStimulusTexts().some((value) => /\bflash\b/i.test(value)) &&
            (!before.Mode || values.Mode !== before.Mode || !before.Stimulus || values.Stimulus !== before.Stimulus),
          before,
          values,
          stimulusTexts: visibleStimulusTexts(),
        }
      }
    )

    await run(
      'review-ops-measurement-points',
      'Switching Review to OPs shows individual OP peak and valley point rows in Measurement.',
      () => textList('.compact-metric-name'),
      async () => {
        await clickButtonByText('Review', '.tabs')
        await afterNextLayoutFrame()
        const mode = labeledControl('.review-select', 'Mode')
        if (!mode) throw new Error('Review Mode select was not visible.')
        const opsOption = Array.from(mode.options).find((option) => option.value === 'OPs' || option.textContent === 'OPs')
        if (opsOption) {
          setControlValue(mode, opsOption.value)
          await afterNextLayoutFrame()
        }
      },
      () => {
        const values = reviewControlValues()
        const names = textList('.compact-metric-name')
        const hasOpsMode = values.Mode === 'OPs' || names.some((value) => /^OP\d+ (peak|valley)$/.test(value))
        return {
          pass: hasOpsMode ? names.includes('OP1 peak') && names.includes('OP1 valley') : true,
          values,
          names: names.slice(0, 18),
        }
      }
    )

    await run(
      'review-plot-range-controls',
      'Clicking Y +/-, Y Auto, and Reset zoom updates the Review waveform range controls.',
      () => firstElementText('.review-plot-actions button.active'),
      async () => {
        await clickButtonByText('Review', '.tabs')
        await afterNextLayoutFrame()
        await clickButtonByText('Y +/-', '.review-plot-actions')
        await afterNextLayoutFrame()
        await clickButtonByText('Y Auto', '.review-plot-actions')
        await afterNextLayoutFrame()
        await clickButtonByText('Reset zoom', '.review-plot-actions')
      },
      () => ({
        pass: firstElementText('.review-plot-actions button.active') === 'Y Auto',
        activeRange: firstElementText('.review-plot-actions button.active'),
        buttons: textList('.review-plot-actions button'),
      })
    )

    await run(
      'inspector-metadata-inputs',
      'Metadata shows Filename, Samples Name, Mode/Acquisition, and editable Group without QC.',
      () => editableFieldValues(),
      async () => {
        setEditableFieldValue('Group', 'QA_GROUP')
      },
      () => {
        const editable = editableFieldValues()
        const metadata = metadataFieldValues()
        const endpointNames = textList('.compact-metric-name')
        const metricBlocks = textList('.metric-side-title')
        const hideImplicitTime = ['Rod', 'Cone', 'Max'].includes(metadata.Mode)
        return {
          pass:
            editable.Group === 'QA_GROUP' &&
            Boolean(metadata.Filename) &&
            Boolean(metadata.Name) &&
            Boolean(metadata.Mode) &&
            Boolean(metadata.Acquisition) &&
            !Object.prototype.hasOwnProperty.call(metadata, 'Pair ID') &&
            !Object.prototype.hasOwnProperty.call(metadata, 'QC') &&
            metricBlocks.includes('OD') &&
            metricBlocks.includes('OS') &&
            (!hideImplicitTime || !endpointNames.some((value) => /implicit time/i.test(value))),
          editable,
          metadata,
          endpointNames,
          metricBlocks,
        }
      }
    )

    await run(
      'intake-cohort-name-edit',
      'Editing the Samples Name field updates the visible file-level alias draft.',
      () => firstValue('.cohort-name-input'),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        changeFirst('.cohort-name-input', 'QA_SAMPLE')
      },
      () => ({
        pass: firstValue('.cohort-name-input') === 'QA_SAMPLE',
        name: firstValue('.cohort-name-input'),
      })
    )

    await run(
      'intake-cohort-group-edit',
      'Editing the Samples Group field updates the visible group draft.',
      () => firstValue('.cohort-group-input'),
      () => changeFirst('.cohort-group-input', 'QA_GROUP'),
      () => ({
        pass: firstValue('.cohort-group-input') === 'QA_GROUP',
        group: firstValue('.cohort-group-input'),
      })
    )

    await run(
      'intake-cohort-apply',
      'Clicking Apply writes file-level Name and Group drafts into the project records.',
      () => firstValue('.cohort-group-input'),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        changeFirst('.cohort-name-input', 'QA_SAMPLE_APPLIED')
        changeFirst('.cohort-group-input', 'QA_GROUP_APPLIED')
        await afterNextLayoutFrame()
        await clickFirst('.intake-cohort-panel .panel-header button')
      },
      () => {
        return {
          pass: firstValue('.cohort-group-input') === 'QA_GROUP_APPLIED',
          group: firstValue('.cohort-group-input'),
          applyEnabled: buttonEnabledByText('Apply', '.intake-cohort-panel .panel-header'),
        }
      }
    )

    await run(
      'intake-pair-issue-review',
      'When a paired-design issue Review button is visible, clicking it opens the affected record in Review.',
      () => visibleElements('.pair-check-row button').length > 0,
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        const button = visibleElements('.pair-check-row button')[0]
        if (button) button.click()
      },
      (wasVisible) => ({
        pass: wasVisible ? activeTabText() === 'Review' : true,
        wasVisible,
        activeTab: activeTabText(),
      })
    )

    await run(
      'analysis-metric-select',
      'Changing the Analysis metric select updates the visible Metric control value.',
      () => analysisControlValues(),
      async () => {
        await clickButtonByText('Analysis', '.tabs')
        await afterNextLayoutFrame()
        changeLabeledSelect('.analysis-control', 'Metric', 'bAmplitudeUv')
      },
      () => {
        const values = analysisControlValues()
        return {
          pass: values.Metric === 'bAmplitudeUv',
          values,
        }
      }
    )

    await run(
      'analysis-source-links-metric',
      'Changing Analysis Type to FVEP exposes FVEP metrics without requiring a duplicate acquisition list.',
      () => ({ filter: activeFilterText(), values: analysisControlValues() }),
      async () => {
        await clickButtonByText('Analysis', '.tabs')
        await afterNextLayoutFrame()
        changeLabeledSelect('.analysis-control', 'Type', 'FVEP')
        await afterNextLayoutFrame()
      },
      () => {
        const values = analysisControlValues()
        return {
          pass:
            values.Type === 'FVEP' &&
            values.Metric === 'p1n1AmplitudeUv',
          activeFilter: activeFilterText(),
          values,
        }
      }
    )

    await run(
      'analysis-mode-layer-selects',
      'Changing Analysis mode and layer controls updates their visible values.',
      () => analysisControlValues(),
      async () => {
        changeLabeledSelect('.analysis-control', 'Type', 'ERG')
        await afterNextLayoutFrame()
        changeLabeledSelect('.analysis-control', 'Mode', firstNonAllOption('.analysis-control', 'Mode'))
        changeLabeledSelect('.analysis-control', 'Layer', 'manual')
      },
      () => {
        const values = analysisControlValues()
        return {
          pass:
            Boolean(values.Mode) &&
            values.Layer === 'manual',
          values,
        }
      }
    )

    await run(
      'analysis-copy-csv-enabled',
      'Copy CSV is enabled on Analysis only when source rows exist; clipboard click is reserved for unlocked desktop QA.',
      () => buttonEnabledByText('Copy CSV', '.source-data-panel'),
      () => {},
      () => ({
        pass: buttonEnabledByText('Copy CSV', '.source-data-panel') === true,
        copyButtonEnabled: buttonEnabledByText('Copy CSV', '.source-data-panel'),
      })
    )

    await run(
      'analysis-plot-controls',
      'Analysis plot controls update group/spread/repeat/smoothing and representative waveform eye controls.',
      () => inlineControlValues(),
      async () => {
        await clickButtonByText('Analysis', '.tabs')
        await afterNextLayoutFrame()
        changeLabeledSelect('.inline-select', 'Spread', 'sem')
        changeLabeledSelect('.inline-select', 'Repeats', 'hide')
        changeLabeledSelect('.inline-select', 'Smooth', 'line')
        changeLabeledSelect('.representative-waveform-panel .inline-select', 'Eye', 'average')
      },
      () => {
        const values = inlineControlValues()
        return {
          pass:
            values.Spread === 'sem' &&
            values.Repeats === 'hide' &&
            values.Smooth === 'line' &&
            values.Eye === 'average',
          values,
        }
      }
    )

    await run(
      'report-scope-erg',
      'Clicking ERG switches the Report Scope selection to ERG.',
      () => activeReportScopeButtonText(),
      async () => {
        await clickButtonByText('Report', '.tabs')
        await afterNextLayoutFrame()
        await clickButtonByText('ERG', '.report-scope-options')
      },
      () => ({
        pass: activeReportScopeButtonText() === 'ERG',
        activeScope: activeReportScopeButtonText(),
        activeFilter: activeFilterText(),
        detail: textSnippet(firstElementText('.report-scope-detail')),
      })
    )

    await run(
      'report-scope-fvep',
      'Clicking FVEP switches Report Scope to FVEP.',
      () => ({ scope: activeReportScopeButtonText(), filter: activeFilterText() }),
      async () => {
        await clickButtonByText('Report', '.tabs')
        await afterNextLayoutFrame()
        await clickButtonByText('FVEP', '.report-scope-options')
      },
      () => ({
        pass: activeReportScopeButtonText() === 'FVEP',
        activeScope: activeReportScopeButtonText(),
        activeFilter: activeFilterText(),
        detail: textSnippet(firstElementText('.report-scope-detail')),
      })
    )

    await run(
      'report-scope-appendix',
      'Clicking Appendix switches the Report Scope selection.',
      () => activeReportScopeButtonText(),
      async () => {
        await clickButtonByText('Report', '.tabs')
        await afterNextLayoutFrame()
        await clickButtonByText('Appendix', '.report-scope-options')
      },
      () => ({
        pass: activeReportScopeButtonText() === 'Appendix',
        activeScope: activeReportScopeButtonText(),
        detail: textSnippet(firstElementText('.report-scope-detail')),
      })
    )

    await run(
      'report-action-buttons-enabled',
      'Report export and copy buttons are enabled when report source rows exist; actual OS writes are reserved for export smoke.',
      () => reportActionButtonStates(),
      () => {},
      () => {
        const states = reportActionButtonStates()
        return {
          pass: states['Export PDF'] === true && states['Copy CSV'] === true,
          states,
        }
      }
    )

    await run(
      'review-manual-pick-arm-and-done',
      'Clicking a manual-pick control arms picking, and Done returns to idle detail state.',
      () => Boolean(document.querySelector('.manual-point-panel.active')),
      async () => {
        await clickButtonByText('Review', '.tabs')
        await afterNextLayoutFrame()
        const manualButton = visibleElements('.manual-buttons button').find((button) => !button.disabled)
        if (!manualButton) throw new Error('No enabled manual-pick button found.')
        manualButton.click()
        await afterNextLayoutFrame()
        const armed = Boolean(document.querySelector('.manual-point-panel.active'))
        await clickButtonByText('Done', '.manual-point-panel')
        await afterNextLayoutFrame()
        if (!armed) throw new Error('Manual pick did not arm before Done.')
      },
      () => ({
        pass:
          !document.querySelector('.manual-point-panel.active') &&
          visibleElements('.manual-pick-panel').length === 1 &&
          visibleElements('.manual-point-panel').length === 1 &&
          visibleElements('.manual-strip .eye-tabs').length === 1 &&
          visibleElements('.manual-point-side').length === 2 &&
          textList('.manual-point-side-title').includes('OD') &&
          textList('.manual-point-side-title').includes('OS') &&
          !document.querySelector('.manual-metrics') &&
          !textList('.manual-strip th').some((value) => ['Endpoint', 'Raw', 'Manual'].includes(value)),
        activeCard: Boolean(document.querySelector('.manual-point-panel.active')),
        pickPanels: visibleElements('.manual-pick-panel').length,
        manualPointPanels: visibleElements('.manual-point-panel').length,
        manualPointSides: visibleElements('.manual-point-side').length,
        eyeTabs: visibleElements('.manual-strip .eye-tabs').length,
        sideTitles: textList('.manual-point-side-title'),
        manualHeaders: textList('.manual-strip th'),
        pointRows: textList('.manual-point-row span'),
      })
    )

    await run(
      'source-file-remove-button',
      'Clicking a Samples row remove button removes one source file and its records from the project.',
      () => sourceAndRecordCounts(),
      async () => {
        await clickButtonByText('Intake', '.tabs')
        await afterNextLayoutFrame()
        const removeButton = visibleElements('.cohort-setup-row .row-action.danger')[0]
        if (!removeButton) throw new Error('No Samples source remove button found.')
        removeButton.click()
      },
      (before) => {
        const after = sourceAndRecordCounts()
        const beforeSources = Number(before && before.sources) || 4
        const beforeRecords = Number(before && before.records) || 14
        return {
          pass: after.sources === beforeSources - 1 && after.records < beforeRecords,
          before,
          after,
        }
      }
    )

    const failures = cases.filter((row) => !row.pass)
    console.log('[qa] interaction cases finished', cases.length, failures.length)
    const controlAudit = await buildQaControlCoverageAudit(cases)
    console.log('[qa] interaction control audit finished', controlAudit.issues.length)
    const layout = buildQaLayoutSnapshot()
    console.log('[qa] interaction layout finished', layout.issues.length)
    const controlFailures = controlAudit.issues.length ? ['control-coverage-audit'] : []
    return {
      status: failures.length || controlFailures.length ? 'failed' : 'ok',
      cases,
      failures: failures.map((row) => row.name).concat(controlFailures),
      layout,
      controlAudit,
    }
  }

  function slimQaInteractionReport(report) {
    const layout = report && report.layout ? report.layout : {}
    return {
      status: report.status,
      cases: (report.cases || []).map((row) => ({
        name: row.name,
        expected: row.expected,
        before: row.before,
        actual: row.actual,
        pass: Boolean(row.pass),
      })),
      failures: report.failures || [],
      layout: {
        issues: Array.isArray(layout.issues) ? layout.issues : [],
        controls: Array.isArray(layout.controls) ? layout.controls.length : 0,
        panels: Array.isArray(layout.panels) ? layout.panels.length : 0,
      },
      controlAudit: summarizeQaControlAudit(report.controlAudit),
      state: report.state || {},
    }
  }

  function summarizeQaControlAudit(audit) {
    if (!audit || typeof audit !== 'object') {
      return { status: 'missing', total: 0, covered: 0, reserved: 0, disabled: 0, issues: ['control-audit-missing'] }
    }
    return {
      status: audit.status,
      total: audit.total,
      covered: audit.covered,
      reserved: audit.reserved,
      disabled: audit.disabled,
      byStep: audit.byStep || {},
      issues: Array.isArray(audit.issues) ? audit.issues : [],
      uncovered: Array.isArray(audit.uncovered) ? audit.uncovered.slice(0, 24) : [],
    }
  }

  async function buildQaControlCoverageAudit(cases) {
    const passedCases = new Set((cases || []).filter((row) => row.pass).map((row) => row.name))
    const rows = []
    const steps = ['Intake', 'Review', 'Analysis', 'Report']
    for (const step of steps) {
      await clickButtonByText(step, '.tabs')
      await afterNextLayoutFrame()
      visibleElements('button, select, input').forEach((element, index) => {
        rows.push(classifyQaControlCoverage(step, element, index, passedCases))
      })
    }
    const issues = []
    const uncovered = rows.filter((row) => row.status === 'uncovered')
    uncovered.slice(0, 24).forEach((row) => {
      issues.push(`control-uncovered:${row.step}:${row.selector}:${row.label || row.role}`)
    })
    rows
      .filter((row) => row.status === 'disabled' && !row.explainsDisabled)
      .slice(0, 12)
      .forEach((row) => {
        issues.push(`disabled-control-without-reason:${row.step}:${row.selector}:${row.label || row.role}`)
      })
    return {
      status: issues.length ? 'failed' : 'ok',
      total: rows.length,
      covered: rows.filter((row) => row.status === 'covered').length,
      reserved: rows.filter((row) => row.status === 'reserved').length,
      disabled: rows.filter((row) => row.status === 'disabled').length,
      byStep: steps.reduce((summary, step) => {
        const stepRows = rows.filter((row) => row.step === step)
        summary[step] = {
          total: stepRows.length,
          covered: stepRows.filter((row) => row.status === 'covered').length,
          reserved: stepRows.filter((row) => row.status === 'reserved').length,
          disabled: stepRows.filter((row) => row.status === 'disabled').length,
          uncovered: stepRows.filter((row) => row.status === 'uncovered').length,
        }
        return summary
      }, {}),
      issues,
      uncovered,
      rows: rows.slice(0, 120),
    }
  }

  function classifyQaControlCoverage(step, element, index, passedCases) {
    const selector = elementSelector(element)
    const label = qaControlLabel(element)
    const disabled = Boolean(element.disabled)
    const base = {
      step,
      index,
      role: String(element.tagName || '').toLowerCase(),
      selector,
      label,
      disabled,
    }
    if (disabled) {
      return {
        ...base,
        status: 'disabled',
        coveredBy: 'disabled-state-layout-audit',
        explainsDisabled: Boolean(element.getAttribute('title') || element.getAttribute('aria-label')),
      }
    }
    const coverage = qaControlCoverageRule(element, label)
    if (!coverage) return { ...base, status: 'uncovered' }
    const reserved = coverage.reserved === true
    const covered =
      reserved || coverage.caseNames.some((caseName) => passedCases.has(caseName) || caseName === 'external-smoke')
    return {
      ...base,
      status: covered ? (reserved ? 'reserved' : 'covered') : 'uncovered',
      coveredBy: coverage.caseNames.join(','),
      reason: coverage.reason || '',
    }
  }

  function qaControlCoverageRule(element, label) {
    const text = label || ''
    if (element.matches('.tabs button')) return coverageRule('topbar-workflow-tab-cycle')
    if (element.closest('.toolbar-actions')) {
      if (element.matches('.quit-action') || text.includes('Quit')) {
        return coverageRule('topbar-quit-entry-visible,external-smoke', 'quit smoke covers the actual exit')
      }
      if (['Demo', 'Open Project', 'Import Excel', 'Save Project'].includes(text)) {
        return reservedCoverage('system-dialog-action', 'native dialogs are intentionally not opened in locked desktop QA')
      }
    }
    if (element.matches('.cohort-setup-row.cohort-setup-data')) return coverageRule('intake-source-select')
    if (element.matches('.acquisition-switch-row .filter-chip')) return coverageRule('intake-category-switch')
    if (element.matches('.acquisition-select-action')) return coverageRule('intake-record-select')
    if (element.matches('.analysis-data-panel .sample-include-toggle')) return coverageRule('analysis-include-toggle')
    if (element.matches('.cohort-setup-row .row-action.danger')) return coverageRule('source-file-remove-button')
    if (element.closest('.review-select')) return coverageRule('review-scope-selects')
    if (element.closest('.field-grid') && element.matches('input')) return coverageRule('inspector-metadata-inputs')
    if (element.closest('.review-plot-actions')) return coverageRule('review-plot-range-controls')
    if (element.closest('.manual-buttons')) return coverageRule('review-manual-pick-arm-and-done')
    if (element.closest('.manual-strip .eye-tabs')) return coverageRule('review-manual-pick-arm-and-done')
    if (element.closest('.manual-point-panel')) return coverageRule('review-manual-pick-arm-and-done')
    if (element.matches('.intake-cohort-panel .panel-header button')) return coverageRule('intake-cohort-apply')
    if (element.matches('.cohort-name-input')) return coverageRule('intake-cohort-name-edit,intake-cohort-apply')
    if (element.matches('.cohort-group-input')) return coverageRule('intake-cohort-group-edit,intake-cohort-apply')
    if (element.closest('.pair-check-row')) return coverageRule('intake-pair-issue-review')
    if (element.closest('.analysis-control')) {
      return coverageRule('analysis-metric-select,analysis-source-links-metric,analysis-mode-layer-selects')
    }
    if (element.closest('.inline-select')) return coverageRule('analysis-plot-controls')
    if (element.matches('.source-data-panel .panel-action')) return coverageRule('analysis-copy-csv-enabled')
    if (element.closest('.report-scope-options')) {
      return coverageRule('report-scope-erg,report-scope-fvep,report-scope-appendix')
    }
    if (element.closest('.export-actions')) {
      if (text === 'Export PDF' || text.includes('Export current report package')) {
        return reservedCoverage('external-smoke', 'PDF export writes are covered by export smoke')
      }
      if (text === 'Copy CSV' || text.includes('Copy report source rows')) return coverageRule('report-action-buttons-enabled')
    }
    return null
  }

  function coverageRule(caseNames, reason) {
    return {
      caseNames: String(caseNames || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      reason: reason || '',
    }
  }

  function reservedCoverage(caseName, reason) {
    return {
      ...coverageRule(caseName, reason),
      reserved: true,
    }
  }

  function qaControlLabel(element) {
    if (!element) return ''
    return textSnippet(
      element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.textContent ||
        element.value ||
        element.getAttribute('placeholder') ||
        ''
    )
  }

  function safeQaValue(fn) {
    try {
      return typeof fn === 'function' ? fn() : null
    } catch (error) {
      return { error: error && error.message ? error.message : String(error) }
    }
  }

  async function clickButtonByText(text, scopeSelector) {
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document
    if (!scope) throw new Error(`Scope not found: ${scopeSelector}`)
    const button = visibleElementsIn(scope, 'button').find(
      (element) => textSnippet(element.textContent) === text && !element.disabled
    )
    if (!button) throw new Error(`Enabled button not found: ${text}`)
    button.click()
  }

  function clickFirst(selector) {
    const element = visibleElements(selector)[0]
    if (!element) throw new Error(`Element not found: ${selector}`)
    if (element.disabled) throw new Error(`Element disabled: ${selector}`)
    element.click()
  }

  function changeFirst(selector, value) {
    const element = visibleElements(selector)[0]
    if (!element) throw new Error(`Element not found: ${selector}`)
    setControlValue(element, value)
  }

  function changeLabeledSelect(rowSelector, label, value) {
    const row = visibleElements(rowSelector).find((element) => {
      const rowLabel = element.querySelector('span, label')
      return rowLabel && textSnippet(rowLabel.textContent) === label
    })
    if (!row) throw new Error(`Labeled select row not found: ${label}`)
    const select = row.querySelector('select')
    if (!select) throw new Error(`Select not found for label: ${label}`)
    setControlValue(select, value)
  }

  function setControlValue(element, value) {
    const options = element.tagName === 'SELECT' ? Array.from(element.options).map((option) => option.value) : []
    if (options.length && !options.includes(value)) throw new Error(`Option not found: ${value}`)
    const prototype =
      element.tagName === 'INPUT'
        ? window.HTMLInputElement.prototype
        : element.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : element.constructor && element.constructor.prototype
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (setter) setter.call(element, value)
    else element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function visibleElementsIn(scope, selector) {
    return Array.from(scope.querySelectorAll(selector)).filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    })
  }

  function activeTabText() {
    return textSnippet(firstElementText('.tab.active'))
  }

  function activeFilterText() {
    return textSnippet(firstElementText('.filter-chip.active'))
  }

  function activeCohortSourceText() {
    const active = visibleElements('.cohort-setup-row.cohort-setup-data.active')[0]
    return textSnippet(active && active.querySelector('.cohort-file-cell') ? active.querySelector('.cohort-file-cell').textContent : '')
  }

  function activeReportScopeButtonText() {
    return textSnippet(firstElementText('.report-scope-options button.active'))
  }

  function firstElementText(selector) {
    const element = visibleElements(selector)[0]
    return element ? textSnippet(element.textContent || element.value || '') : ''
  }

  function firstValue(selector) {
    const element = visibleElements(selector)[0]
    return element ? element.value || '' : ''
  }

  function reviewControlValues() {
    return controlValuesByLabel('.review-select')
  }

  function editableFieldValues() {
    return visibleElements('.field')
      .filter((field) => field.querySelector('input'))
      .reduce((values, field) => {
        const label = textSnippet(field.querySelector('label')?.textContent || '')
        const input = field.querySelector('input')
        if (label && input) values[label] = input.value || ''
        return values
      }, {})
  }

  function setEditableFieldValue(label, value) {
    const field = visibleElements('.field').find(
      (element) => textSnippet(element.querySelector('label')?.textContent || '') === label
    )
    if (!field) throw new Error(`Editable field not found: ${label}`)
    const input = field.querySelector('input')
    if (!input) throw new Error(`Input not found for field: ${label}`)
    setControlValue(input, value)
  }

  function buttonEnabledByText(text, scopeSelector) {
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document
    if (!scope) return false
    const button = visibleElementsIn(scope, 'button').find((element) => textSnippet(element.textContent) === text)
    return Boolean(button && !button.disabled)
  }

  function textList(selector) {
    return visibleElements(selector).map((element) => textSnippet(element.textContent || element.value || ''))
  }

  function clickDifferentSampleRow() {
    const current = activeSampleKey()
    const rows = visibleElements('.acquisition-record-row .acquisition-select-action')
    const target =
      rows.find((row) => textSnippet(row.textContent || '') && sampleActionKey(row) !== current) || rows[0]
    if (!target) throw new Error('No sample row action found.')
    target.click()
  }

  function activeSampleKey() {
    const action = visibleElements('.acquisition-record-row.active .acquisition-select-action')[0]
    if (action) return sampleActionKey(action)
    const fields = metadataFieldValues()
    return [fields.Filename, fields.Acquisition].filter(Boolean).join(' | ')
  }

  function sampleActionKey(action) {
    return textSnippet(action.textContent || '')
  }

  function metadataFieldValues() {
    return visibleElements('.field').reduce((values, field) => {
      const label = textSnippet(field.querySelector('label')?.textContent || '')
      const input = field.querySelector('input')
      const readonly = field.querySelector('.field-readonly')
      const value = input ? input.value || '' : readonly ? readonly.textContent || '' : ''
      if (label) values[label] = textSnippet(value)
      return values
    }, {})
  }

  function visibleStimulusTexts() {
    const texts = []
    const reviewStimulus = labeledControl('.review-select', 'Stimulus')
    if (reviewStimulus) {
      const selected = reviewStimulus.options ? reviewStimulus.options[reviewStimulus.selectedIndex] : null
      texts.push(textSnippet((selected && selected.textContent) || reviewStimulus.value || ''))
    }
    const metadata = metadataFieldValues()
    if (metadata.Stimulus) texts.push(metadata.Stimulus)
    textList('.acquisition-condition-cell').forEach((value) => texts.push(value))
    textList('.waveform-caption').forEach((value) => texts.push(value))
    return texts.filter(Boolean)
  }

  function analysisControlValues() {
    return controlValuesByLabel('.analysis-control')
  }

  function inlineControlValues() {
    return controlValuesByLabel('.inline-select')
  }

  function controlValuesByLabel(rowSelector) {
    return visibleElements(rowSelector).reduce((values, row) => {
      const label = textSnippet(row.querySelector('span, label')?.textContent || '')
      const select = row.querySelector('select')
      if (label && select) values[label] = select.value || ''
      return values
    }, {})
  }

  function labeledControl(rowSelector, label) {
    const row = visibleElements(rowSelector).find((element) => {
      const rowLabel = element.querySelector('span, label')
      return rowLabel && textSnippet(rowLabel.textContent) === label
    })
    return row ? row.querySelector('select, input, button') : null
  }

  function firstNonAllOption(rowSelector, label) {
    const select = labeledControl(rowSelector, label)
    if (!select) throw new Error(`Select not found for label: ${label}`)
    const option = Array.from(select.options).find((item) => item.value && item.value !== 'All')
    if (!option) throw new Error(`No non-All option found for label: ${label}`)
    return option.value
  }

  function reportActionButtonStates() {
    const panel = document.querySelector('.export-actions')
    if (!panel) return {}
    return visibleElementsIn(panel, 'button').reduce((states, button) => {
      states[textSnippet(button.textContent)] = !button.disabled
      return states
    }, {})
  }

  function sourceAndRecordCounts() {
    const visibleSources = visibleElements('.cohort-setup-row:not(.cohort-setup-head)').length
    const visibleRecords = visibleElements('.acquisition-record-row:not(.acquisition-record-head)').length
    return {
      sources: visibleSources,
      records: visibleRecords,
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(e(App))
})()
