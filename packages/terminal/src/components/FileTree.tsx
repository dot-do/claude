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
    return <span className="text-yellow-400">📁</span>
  }

  // Simple file type detection
  const ext = name.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    ts: '📘',
    tsx: '📘',
    js: '📒',
    jsx: '📒',
    json: '📋',
    md: '📝',
    css: '🎨',
    html: '🌐',
    py: '🐍',
    rs: '🦀',
    go: '🐹',
  }

  return <span>{iconMap[ext || ''] || '📄'}</span>
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
          hover:bg-gray-800 rounded transition-colors
          ${isSelected ? 'bg-gray-700 text-white' : 'text-gray-300'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDirectory && (
          <span className="text-gray-500 w-4">
            {loading ? '⏳' : expanded ? '▼' : '▶'}
          </span>
        )}
        {!isDirectory && <span className="w-4" />}

        <FileIcon type={node.type} name={node.name} />

        <span className="flex-1 truncate">{node.name}</span>

        {showSize && node.size !== undefined && (
          <span className="text-gray-500 text-xs">{formatSize(node.size)}</span>
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
    <div className={`overflow-auto ${className}`} role="tree" aria-label="File tree">
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
        <div className="text-gray-500 text-sm p-4">No files</div>
      )}
    </div>
  )
}

export default FileTree
