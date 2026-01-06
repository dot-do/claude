/**
 * DiffViewer Component
 *
 * Displays git unified diff format with syntax highlighting.
 * Supports unified and split (side-by-side) view modes.
 */

import { useMemo } from 'react'

export type DiffViewMode = 'unified' | 'split'

export interface DiffViewerProps {
  /** The diff content in git unified diff format */
  diff: string
  /** View mode: unified (default) or split (side-by-side) */
  viewMode?: DiffViewMode
  /** Show line numbers */
  showLineNumbers?: boolean
  /** Language for syntax highlighting */
  language?: string
  /** Aria label for accessibility */
  ariaLabel?: string
  /** Additional CSS class */
  className?: string
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header' | 'hunk'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

interface DiffHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

interface DiffFile {
  oldPath: string
  newPath: string
  hunks: DiffHunk[]
}

function parseDiff(diff: string): DiffFile[] {
  if (!diff || !diff.trim()) {
    return []
  }

  const files: DiffFile[] = []
  const lines = diff.split('\n')
  let currentFile: DiffFile | null = null
  let currentHunk: DiffHunk | null = null
  let oldLineNum = 0
  let newLineNum = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // File header: diff --git a/... b/...
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk)
        }
        files.push(currentFile)
      }
      // Extract file paths from diff --git a/path b/path
      const match = line.match(/diff --git a\/(.+) b\/(.+)/)
      currentFile = {
        oldPath: match ? match[1] : '',
        newPath: match ? match[2] : '',
        hunks: [],
      }
      currentHunk = null
      continue
    }

    // Skip index, --- and +++ lines (file headers)
    if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      continue
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk)
      }
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match) {
        oldLineNum = parseInt(match[1], 10)
        newLineNum = parseInt(match[3], 10)
        currentHunk = {
          header: line,
          oldStart: oldLineNum,
          oldCount: parseInt(match[2] || '1', 10),
          newStart: newLineNum,
          newCount: parseInt(match[4] || '1', 10),
          lines: [],
        }
      }
      continue
    }

    // Diff content lines
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'added',
          content: line.slice(1),
          newLineNumber: newLineNum++,
        })
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'removed',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
        })
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        })
      }
    }
  }

  // Push the last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk)
    }
    files.push(currentFile)
  }

  return files
}

function applySyntaxHighlight(content: string, language?: string): string {
  // Simple syntax highlighting using CSS classes
  // This is a basic implementation - could be enhanced with a proper syntax highlighter
  if (!language) return content

  // For now, we'll just return the content and mark it as having highlighting
  // A real implementation would tokenize and wrap in spans
  return content
}

interface LineNumberProps {
  oldNum?: number
  newNum?: number
  unified?: boolean
}

function LineNumber({ oldNum, newNum, unified }: LineNumberProps) {
  if (unified) {
    return (
      <span
        data-testid="diff-line-number"
        className="select-none text-slate-400 dark:text-slate-500 text-right pr-2 min-w-[4rem] inline-block font-mono text-xs"
      >
        {oldNum !== undefined ? oldNum : ''}
        {oldNum !== undefined && newNum !== undefined ? ' ' : ''}
        {newNum !== undefined ? newNum : ''}
      </span>
    )
  }

  return (
    <span
      data-testid="diff-line-number"
      className="select-none text-slate-400 dark:text-slate-500 text-right pr-2 min-w-[3rem] inline-block font-mono text-xs"
    >
      {oldNum ?? newNum ?? ''}
    </span>
  )
}

interface DiffLineRowProps {
  line: DiffLine
  showLineNumbers: boolean
  language?: string
}

function DiffLineRow({ line, showLineNumbers, language }: DiffLineRowProps) {
  const getLineClasses = () => {
    switch (line.type) {
      case 'added':
        return 'bg-green-100 dark:bg-green-900/30'
      case 'removed':
        return 'bg-red-100 dark:bg-red-900/30'
      default:
        return ''
    }
  }

  const getIndicator = () => {
    switch (line.type) {
      case 'added':
        return <span className="text-green-600 dark:text-green-400 font-bold w-4 inline-block">+</span>
      case 'removed':
        return <span className="text-red-600 dark:text-red-400 font-bold w-4 inline-block">-</span>
      default:
        return <span className="w-4 inline-block">&nbsp;</span>
    }
  }

  const testId = `diff-line-${line.type}`
  const highlighted = applySyntaxHighlight(line.content, language)

  return (
    <div
      data-testid={testId}
      className={`flex font-mono text-sm leading-6 ${getLineClasses()}`}
    >
      {showLineNumbers && (
        <LineNumber
          oldNum={line.oldLineNumber}
          newNum={line.newLineNumber}
          unified
        />
      )}
      {getIndicator()}
      <span
        data-testid="diff-line-content"
        className={`flex-1 whitespace-pre ${language ? 'syntax-highlight' : ''}`}
      >
        {highlighted}
      </span>
    </div>
  )
}

interface UnifiedViewProps {
  files: DiffFile[]
  showLineNumbers: boolean
  language?: string
}

function UnifiedView({ files, showLineNumbers, language }: UnifiedViewProps) {
  return (
    <div data-testid="diff-view-unified" className="overflow-x-auto">
      {files.map((file, fileIndex) => (
        <div key={fileIndex} className="mb-4">
          <div
            data-testid="diff-file-header"
            className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700"
          >
            {file.newPath}
          </div>
          {file.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex}>
              <div
                data-testid="diff-hunk-header"
                className="bg-slate-50 dark:bg-slate-800/50 px-4 py-1 text-xs text-blue-600 dark:text-blue-400 font-mono"
              >
                {hunk.header}
              </div>
              <div className="bg-white dark:bg-slate-900">
                {hunk.lines.map((line, lineIndex) => (
                  <DiffLineRow
                    key={lineIndex}
                    line={line}
                    showLineNumbers={showLineNumbers}
                    language={language}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

interface SplitViewProps {
  files: DiffFile[]
  showLineNumbers: boolean
  language?: string
}

function SplitView({ files, showLineNumbers, language }: SplitViewProps) {
  // Create paired lines for split view
  const createPairedLines = (hunks: DiffHunk[]) => {
    const pairs: { left: DiffLine | null; right: DiffLine | null }[] = []

    for (const hunk of hunks) {
      // Add hunk header as context
      pairs.push({
        left: { type: 'header', content: hunk.header },
        right: { type: 'header', content: hunk.header },
      })

      let i = 0
      while (i < hunk.lines.length) {
        const line = hunk.lines[i]

        if (line.type === 'context') {
          pairs.push({ left: line, right: line })
          i++
        } else if (line.type === 'removed') {
          // Look ahead for a matching addition
          let j = i + 1
          while (j < hunk.lines.length && hunk.lines[j].type === 'removed') {
            j++
          }
          // Now j points to first non-removed line after i
          const removedCount = j - i

          // Count additions
          let addedCount = 0
          let k = j
          while (k < hunk.lines.length && hunk.lines[k].type === 'added') {
            addedCount++
            k++
          }

          // Pair them up
          const maxPairs = Math.max(removedCount, addedCount)
          for (let p = 0; p < maxPairs; p++) {
            const removedLine = p < removedCount ? hunk.lines[i + p] : null
            const addedLine = p < addedCount ? hunk.lines[j + p] : null
            pairs.push({ left: removedLine, right: addedLine })
          }

          i = k
        } else if (line.type === 'added') {
          // Standalone addition (no preceding removal)
          pairs.push({ left: null, right: line })
          i++
        } else {
          i++
        }
      }
    }

    return pairs
  }

  return (
    <div data-testid="diff-view-split" className="overflow-x-auto">
      {files.map((file, fileIndex) => {
        const pairs = createPairedLines(file.hunks)

        return (
          <div key={fileIndex} className="mb-4">
            <div
              data-testid="diff-file-header"
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700"
            >
              {file.newPath}
            </div>
            <div className="flex">
              {/* Left side (old) */}
              <div data-testid="diff-split-left" className="flex-1 border-r border-slate-200 dark:border-slate-700">
                {pairs.map((pair, idx) => {
                  if (pair.left?.type === 'header') {
                    return (
                      <div
                        key={idx}
                        data-testid="diff-hunk-header"
                        className="bg-slate-50 dark:bg-slate-800/50 px-4 py-1 text-xs text-blue-600 dark:text-blue-400 font-mono"
                      >
                        {pair.left.content}
                      </div>
                    )
                  }

                  const line = pair.left
                  if (!line) {
                    return (
                      <div key={idx} className="flex font-mono text-sm leading-6 bg-slate-50 dark:bg-slate-900/50">
                        {showLineNumbers && (
                          <span
                            data-testid="diff-line-number"
                            className="select-none text-slate-400 dark:text-slate-500 text-right pr-2 min-w-[3rem] inline-block font-mono text-xs"
                          />
                        )}
                        <span className="flex-1">&nbsp;</span>
                      </div>
                    )
                  }

                  const bgClass = line.type === 'removed' ? 'bg-red-100 dark:bg-red-900/30' : ''
                  const highlighted = applySyntaxHighlight(line.content, language)

                  return (
                    <div
                      key={idx}
                      data-testid={line.type === 'removed' ? 'diff-line-removed' : 'diff-line-context'}
                      className={`flex font-mono text-sm leading-6 ${bgClass}`}
                    >
                      {showLineNumbers && (
                        <LineNumber oldNum={line.oldLineNumber} />
                      )}
                      <span
                        data-testid="diff-line-content"
                        className={`flex-1 whitespace-pre ${language ? 'syntax-highlight' : ''}`}
                      >
                        {highlighted}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Right side (new) */}
              <div data-testid="diff-split-right" className="flex-1">
                {pairs.map((pair, idx) => {
                  if (pair.right?.type === 'header') {
                    return (
                      <div
                        key={idx}
                        className="bg-slate-50 dark:bg-slate-800/50 px-4 py-1 text-xs text-blue-600 dark:text-blue-400 font-mono"
                      >
                        {pair.right.content}
                      </div>
                    )
                  }

                  const line = pair.right
                  if (!line) {
                    return (
                      <div key={idx} className="flex font-mono text-sm leading-6 bg-slate-50 dark:bg-slate-900/50">
                        {showLineNumbers && (
                          <span className="select-none text-slate-400 dark:text-slate-500 text-right pr-2 min-w-[3rem] inline-block font-mono text-xs" />
                        )}
                        <span className="flex-1">&nbsp;</span>
                      </div>
                    )
                  }

                  const bgClass = line.type === 'added' ? 'bg-green-100 dark:bg-green-900/30' : ''
                  const highlighted = applySyntaxHighlight(line.content, language)

                  return (
                    <div
                      key={idx}
                      data-testid={line.type === 'added' ? 'diff-line-added' : 'diff-line-context'}
                      className={`flex font-mono text-sm leading-6 ${bgClass}`}
                    >
                      {showLineNumbers && (
                        <LineNumber newNum={line.newLineNumber} />
                      )}
                      <span
                        data-testid="diff-line-content"
                        className={`flex-1 whitespace-pre ${language ? 'syntax-highlight' : ''}`}
                      >
                        {highlighted}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DiffViewer({
  diff,
  viewMode = 'unified',
  showLineNumbers = true,
  language,
  ariaLabel = 'Diff viewer',
  className = '',
}: DiffViewerProps) {
  const files = useMemo(() => parseDiff(diff), [diff])

  if (files.length === 0) {
    return (
      <div
        data-testid="diff-viewer"
        role="region"
        aria-label={ariaLabel}
        className={`p-4 text-slate-400 dark:text-slate-500 text-center ${className}`}
      >
        No changes to display
      </div>
    )
  }

  return (
    <div
      data-testid="diff-viewer"
      role="region"
      aria-label={ariaLabel}
      className={`bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 ${className}`}
    >
      {viewMode === 'unified' ? (
        <UnifiedView files={files} showLineNumbers={showLineNumbers} language={language} />
      ) : (
        <SplitView files={files} showLineNumbers={showLineNumbers} language={language} />
      )}
    </div>
  )
}

export default DiffViewer
