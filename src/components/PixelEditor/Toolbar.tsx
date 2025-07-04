import React from 'react';
import { Brush, Eraser, PartyPopper as Eyedropper, PaintBucket, Undo, Redo, ZoomIn, ZoomOut, Download, Save, RotateCcw, Upload } from 'lucide-react';
import { EditorState } from '../../types';

interface ToolbarProps {
  editorState: EditorState;
  onStateChange: (newState: Partial<EditorState>) => void;
  onSave: () => void;
  onSaveDraft: () => void;
  onDownload: () => void;
  onClear: () => void;
  onCanvasSizeChange: (width: number, height: number) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  editorState,
  onStateChange,
  onSave,
  onSaveDraft,
  onDownload,
  onClear,
  onCanvasSizeChange,
}) => {
  const tools = [
    { id: 'brush', icon: Brush, label: 'ペン', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: '消しゴム', shortcut: 'E' },
    { id: 'eyedropper', icon: Eyedropper, label: 'スポイト', shortcut: 'I' },
    { id: 'fill', icon: PaintBucket, label: '塗りつぶし', shortcut: 'F' },
    { id: 'line', icon: Brush, label: '直線', shortcut: 'L' },
    { id: 'rect', icon: Brush, label: '四角', shortcut: 'R' },
    { id: 'ellipse', icon: Brush, label: '円', shortcut: 'O' },
    { id: 'move', icon: Brush, label: '全体移動', shortcut: 'M' },
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

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {/* Tools */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Tools</h3>
        <div className="flex flex-col gap-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => onStateChange({ tool: tool.id })}
                className={`flex items-center space-x-4 p-5 rounded-2xl border text-xl transition-all duration-200 min-h-[64px] \
                  ${editorState.tool === tool.id
                    ? 'border-indigo-500 bg-indigo-100 text-indigo-700 shadow-lg'
                    : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-100'}
                `}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <Icon className="h-9 w-9" />
                <span className="font-semibold text-xl">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* History */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">History</h3>
        <div className="flex space-x-2">
          <button
            onClick={undo}
            disabled={editorState.historyIndex <= 0}
            className="flex items-center justify-center p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={editorState.historyIndex >= editorState.history.length - 1}
            className="flex items-center justify-center p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            title="Redo (Ctrl+Y)"
          >
            <Redo className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Zoom */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Zoom</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={zoomOut}
            className="flex items-center justify-center p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all duration-200"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gray-600 min-w-[3rem] text-center">
            {Math.round(editorState.zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="flex items-center justify-center p-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all duration-200"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Canvas Size Selector */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Canvas Size</h3>
        <select
          value={`${editorState.layers[0].canvas[0].length}x${editorState.layers[0].canvas.length}`}
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
                checked={editorState.showGrid}
                onChange={e => onStateChange({ showGrid: e.target.checked })}
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
                checked={editorState.backgroundPattern === 'dark'}
                onChange={e => onStateChange({ backgroundPattern: e.target.checked ? 'dark' : 'light' })}
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
            onClick={onSaveDraft}
            className="w-full flex items-center justify-center space-x-2 p-2 bg-yellow-400 text-white rounded-lg hover:bg-yellow-500 transition-colors duration-200"
          >
            <Save className="h-4 w-4" />
            <span className="text-sm font-medium">下書き保存</span>
          </button>
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