
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Brush, Eraser, PartyPopper as Eyedropper, PaintBucket, Undo, Redo, ZoomIn, ZoomOut, Download, Save, RotateCcw, Upload, Scissors } from 'lucide-react';
import { EditorState } from '../../types';

interface ToolbarProps {
  editorState: EditorState;
  onStateChange: (newState: Partial<EditorState>) => void;
  onSave: () => void;
  onDownload: () => void;
  onClear: () => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  onLassoMenuAction?: (action: 'copy' | 'delete' | 'move') => void;
  backgroundPattern: 'light' | 'dark';
  onBackgroundPatternChange: (pattern: 'light' | 'dark') => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  editorState,
  onStateChange,
  onSave,
  onDownload,
  onClear,
  onCanvasSizeChange,
  onLassoMenuAction,
  backgroundPattern,
  onBackgroundPatternChange,
  showGrid,
  onShowGridChange,
}) => {
  const [lassoMenuOpen, setLassoMenuOpen] = useState(false);
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false);
  const [eraserMenuPos, setEraserMenuPos] = useState<{ left: number; top: number } | null>(null);
  const eraserBtnRef = useRef<HTMLButtonElement | null>(null);
  const eraserMenuRoot = typeof document !== 'undefined' ? document.body : null;

  useEffect(() => {
    if (!eraserMenuOpen) return;
    const close = () => setEraserMenuOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const onDoc = (e: MouseEvent) => {
      if (!eraserMenuOpen) return;
      const btn = eraserBtnRef.current;
      const menu = document.getElementById('eraser-menu-popup');
      if (menu && (menu === e.target || menu.contains(e.target as Node))) return;
      if (btn && (btn === e.target || btn.contains(e.target as Node))) return;
      setEraserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [eraserMenuOpen]);
  const tools = [
    { id: 'brush', icon: Brush, label: 'ペン', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: '消しゴム', shortcut: 'E' },
    { id: 'eyedropper', icon: Eyedropper, label: 'スポイト', shortcut: 'I' },
    { id: 'fill', icon: PaintBucket, label: '塗りつぶし', shortcut: 'F' },
    { id: 'line', icon: Brush, label: '直線', shortcut: 'L' },
    { id: 'rect', icon: Brush, label: '四角', shortcut: 'R' },
    { id: 'ellipse', icon: Brush, label: '円', shortcut: 'O' },
    { id: 'lasso', icon: Scissors, label: '投げ縄', shortcut: 'S' },
  ] as const;

  const undo = () => {
    if (editorState.historyIndex > 0) {
      const newIndex = editorState.historyIndex - 1;
      const layers = editorState.history[newIndex];
      onStateChange({
        layers,
        historyIndex: newIndex,
        canvas: layers[editorState.currentLayer]?.canvas,
      });
    }
  };

  const redo = () => {
    if (editorState.historyIndex < editorState.history.length - 1) {
      const newIndex = editorState.historyIndex + 1;
      const layers = editorState.history[newIndex];
      onStateChange({
        layers,
        historyIndex: newIndex,
        canvas: layers[editorState.currentLayer]?.canvas,
      });
    }
  };

  const zoomIn = () => {
    onStateChange({ zoom: Math.min(editorState.zoom * 1.2, 3) });
  };

  const zoomOut = () => {
    onStateChange({ zoom: Math.max(editorState.zoom / 1.2, 0.5) });
  };

  const handleToolClick = (toolId: EditorState['tool']) => {
    if (toolId === 'lasso') {
      if (editorState.tool === 'lasso') {
        setLassoMenuOpen((prev) => !prev);
        onStateChange({ lassoMenuOpen: !lassoMenuOpen });
      } else {
        setLassoMenuOpen(false);
        onStateChange({ tool: 'lasso', lassoMenuOpen: false });
      }
    } else {
      setLassoMenuOpen(false);
      onStateChange({ tool: toolId, lassoMenuOpen: false });
    }
  };

  // Canvas Size Selector
  const firstLayer = editorState.layers[0];
  const canvasSizeValue =
    firstLayer && firstLayer.canvas
      ? `${firstLayer.canvas[0].length}x${firstLayer.canvas.length}`
      : "32x32";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4 relative">
      {/* Tools */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Tools</h3>
        <div className="flex flex-col gap-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div key={tool.id} className="relative">
              <button
                  onClick={() => handleToolClick(tool.id)}
                className={`flex items-center space-x-4 p-5 rounded-2xl border text-xl transition-all duration-200 min-h-[64px] \
                  ${editorState.tool === tool.id
                    ? 'border-indigo-500 bg-indigo-100 text-indigo-700 shadow-lg'
                    : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-100'}
                `}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <Icon className="h-9 w-9" />
                <span className="font-semibold text-xl">{tool.label}</span>
                {tool.id === 'eraser' && (
                  <span className="ml-auto text-sm text-gray-600">{editorState.eraserScope === 'all' ? '全レイヤー' : '現在レイヤー'}</span>
                )}
              </button>
                {tool.id === 'eraser' && (
                  <>
                    <button
                      ref={eraserBtnRef}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded hover:bg-indigo-100"
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setEraserMenuPos({ left: Math.round(rect.right + 8), top: Math.round(rect.top) });
                        setEraserMenuOpen((v) => !v);
                      }}
                      title="消しゴムの作用範囲"
                    >
                      <span className="inline-block" style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '8px solid #374151' }} />
                    </button>
                    {eraserMenuOpen && eraserMenuPos && eraserMenuRoot && createPortal(
                      <div
                        id="eraser-menu-popup"
                        style={{ position: 'fixed', left: eraserMenuPos.left, top: eraserMenuPos.top, zIndex: 10000 }}
                        className="bg-white border border-gray-300 rounded-2xl shadow-lg overflow-hidden min-w-[220px]"
                      >
                        <button
                          className={`block w-full text-left px-5 py-3 hover:bg-indigo-50 ${(!editorState.eraserScope || editorState.eraserScope === 'current') ? 'font-semibold text-indigo-700' : ''}`}
                          onClick={(e) => { e.preventDefault(); onStateChange({ eraserScope: 'current' }); setEraserMenuOpen(false); }}
                        >現在レイヤーのみ</button>
                        <div className="h-px bg-gray-200" />
                        <button
                          className={`block w-full text-left px-5 py-3 hover:bg-indigo-50 ${editorState.eraserScope === 'all' ? 'font-semibold text-indigo-700' : ''}`}
                          onClick={(e) => { e.preventDefault(); onStateChange({ eraserScope: 'all' }); setEraserMenuOpen(false); }}
                        >全レイヤー</button>
                      </div>,
                      eraserMenuRoot
                    )}
                  </>
                )}
                {/* Lasso menu */}
                {tool.id === 'lasso' && lassoMenuOpen && (
                  <div className="absolute left-full top-0 ml-2 z-10 bg-white border border-gray-300 rounded-lg shadow-lg flex flex-col w-40">
                    <button
                      className={`px-4 py-2 text-left hover:bg-indigo-50 ${editorState.lassoMode === 'copying' ? 'text-green-600 font-bold lasso-glow' : ''}`}
                      style={editorState.lassoMode === 'copying' ? { textShadow: '0 0 8px #22c55e, 0 0 16px #bbf7d0' } : {}}
                      onClick={() => onLassoMenuAction?.('copy')}
                    >コピー</button>
                    <button
                      className={`px-4 py-2 text-left hover:bg-indigo-50 ${editorState.lassoMode === 'moving' ? 'text-blue-600 font-bold lasso-glow' : ''}`}
                      style={editorState.lassoMode === 'moving' ? { textShadow: '0 0 8px #2563eb, 0 0 16px #bfdbfe' } : {}}
                      onClick={() => onLassoMenuAction?.('move')}
                    >移動</button>
                    <button className="px-4 py-2 hover:bg-indigo-50 text-left" onClick={() => onLassoMenuAction?.('delete')}>範囲消去</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Canvas Size Selector */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Canvas Size</h3>
        <select
          value={canvasSizeValue}
          onChange={e => {
            const [width, height] = e.target.value.split('x').map(Number);
            onCanvasSizeChange(width, height);
          }}
          className="border border-gray-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full"
        >
          <option value="16x16">16×16</option>
          <option value="32x32">32×32</option>
          <option value="64x64">64×64</option>
          <option value="128x128">128×128</option>
        </select>
      </div>

      {/* Grid Toggle */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Grid</h3>
        <div className="flex items-center space-x-2">
          <label className="flex items-center cursor-pointer">
            <span className="mr-2 text-sm text-gray-700">マス目を表示</span>
            <span className="relative inline-block w-12 h-7 align-middle select-none">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={e => onShowGridChange(e.target.checked)}
                className="sr-only peer"
              />
              <span className="block w-12 h-7 rounded-full bg-gray-300 peer-checked:bg-indigo-900 transition" />
              <span className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </div>

      {/* Background Pattern Toggle */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Background</h3>
        <div className="flex items-center space-x-2">
          <label className="flex items-center cursor-pointer">
            <span className="mr-2 text-sm text-gray-700">ダークパターン</span>
            <span className="relative inline-block w-12 h-7 align-middle select-none">
              <input
                type="checkbox"
                checked={backgroundPattern === 'dark'}
                onChange={e => onBackgroundPatternChange(e.target.checked ? 'dark' : 'light')}
                className="sr-only peer"
              />
              <span className="block w-12 h-7 rounded-full bg-gray-300 peer-checked:bg-indigo-900 transition" />
              <span className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>
        <div className="space-y-2">
          <button
            onClick={onSave}
            className="w-full flex items-center justify-center space-x-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200"
          >
            <Upload className="h-4 w-4" />
            <span className="text-sm font-medium">投稿</span>
          </button>
          <button
            onClick={onDownload}
            className="w-full flex items-center justify-center space-x-2 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200"
          >
            <Download className="h-4 w-4" />
            <span className="text-sm font-medium">Download</span>
          </button>
          <button
            onClick={onClear}
            className="w-full flex items-center justify-center space-x-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="text-sm font-medium">Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
};