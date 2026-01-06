/**
 * FileTree Component
 *
 * Directory browser with lazy loading and file selection.
 * Tool-agnostic - works with any file listing API.
 */

import { useState, useCallback } from 'react'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: string
  children?: FileNode[]
}

export interface FileTreeProps {
  /** Root files/directories to display */
  files: FileNode[]
  /** Called when a file is selected */
  onSelect?: (file: FileNode) => void
  /** Called when a directory is expanded (for lazy loading) */
  onExpand?: (dir: FileNode) => Promise<FileNode[]> | FileNode[]
  /** Currently selected file path */
  selectedPath?: string
  /** Show file sizes */
  showSize?: boolean
  /** Show modified dates */
  showDate?: boolean
  /** Additional CSS class */
  className?: string
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  selectedPath?: string
  onSelect?: (file: FileNode) => void
  onExpand?: (dir: FileNode) => Promise<FileNode[]> | FileNode[]
  showSize?: boolean
  showDate?: boolean
}

function FileIcon({ type, name }: { type: 'file' | 'directory'; name: string }) {
  if (type === 'directory') {
    return (
      <svg className="w-4 h-4 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    )
  }

  // Simple file type detection
  const ext = name.split('.').pop()?.toLowerCase()
  const colorMap: Record<string, string> = {
    ts: 'text-blue-500 dark:text-blue-400',
    tsx: 'text-blue-500 dark:text-blue-400',
    js: 'text-yellow-500 dark:text-yellow-400',
    jsx: 'text-yellow-500 dark:text-yellow-400',
    json: 'text-green-500 dark:text-green-400',
    md: 'text-slate-500 dark:text-slate-400',
    css: 'text-pink-500 dark:text-pink-400',
    html: 'text-orange-500 dark:text-orange-400',
    py: 'text-blue-500 dark:text-blue-400',
    rs: 'text-orange-600 dark:text-orange-500',
    go: 'text-cyan-500 dark:text-cyan-400',
  }

  const colorClass = colorMap[ext || ''] || 'text-slate-400 dark:text-slate-500'

  return (
    <svg className={`w-4 h-4 ${colorClass}`} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  )
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  onExpand,
  showSize,
  showDate,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileNode[]>(node.children || [])
  const [loading, setLoading] = useState(false)

  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'

  const handleClick = useCallback(async () => {
    if (isDirectory) {
      if (!expanded && onExpand && children.length === 0) {
        setLoading(true)
        try {
          const loadedChildren = await onExpand(node)
          setChildren(loadedChildren)
        } finally {
          setLoading(false)
        }
      }
      setExpanded(!expanded)
    } else {
      onSelect?.(node)
    }
  }, [isDirectory, expanded, onExpand, onSelect, node, children.length])

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / 1024 / 1024).toFixed(1)}M`
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={`
          w-full flex items-center gap-2 px-2 py-1 text-left text-sm
          hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors
          ${isSelected ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDirectory && (
          <span className="text-slate-400 dark:text-slate-500 w-4 flex-shrink-0">
            {loading ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : expanded ? (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </span>
        )}
        {!isDirectory && <span className="w-4 flex-shrink-0" />}

        <FileIcon type={node.type} name={node.name} />

        <span className="flex-1 truncate">{node.name}</span>

        {showSize && node.size !== undefined && (
          <span className="text-slate-400 dark:text-slate-500 text-xs">{formatSize(node.size)}</span>
        )}
      </button>

      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onExpand={onExpand}
              showSize={showSize}
              showDate={showDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({
  files,
  onSelect,
  onExpand,
  selectedPath,
  showSize = false,
  showDate = false,
  className = '',
}: FileTreeProps) {
  return (
    <div className={`overflow-auto py-1 ${className}`} role="tree" aria-label="File tree">
      {files.map((file) => (
        <TreeNode
          key={file.path}
          node={file}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onExpand={onExpand}
          showSize={showSize}
          showDate={showDate}
        />
      ))}
      {files.length === 0 && (
        <div className="text-slate-400 dark:text-slate-500 text-sm p-4 text-center">No files</div>
      )}
    </div>
  )
}

export default FileTree
