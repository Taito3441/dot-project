import React from 'react';
import { Brush, Eraser, PartyPopper as Eyedropper, PaintBucket, Undo, Redo, ZoomIn, ZoomOut, Download, Save, RotateCcw } from 'lucide-react';
import { EditorState } from '../../types';

interface ToolbarProps {
  editorState: EditorState;
  onStateChange: (newState: Partial<EditorState>) => void;
  onSave: () => void;
  onDownload: () => void;
  onClear: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  editorState,
  onStateChange,
  onSave,
  onDownload,
  onClear,
}) => {
  const tools = [
    { id: 'brush', icon: Brush, label: 'Brush', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
    { id: 'eyedropper', icon: Eyedropper, label: 'Eyedropper', shortcut: 'I' },
    { id: 'fill', icon: PaintBucket, label: 'Fill', shortcut: 'F' },
  ] as const;

  const undo = () => {
    if (editorState.historyIndex > 0) {
      const newIndex = editorState.historyIndex - 1;
      onStateChange({
        canvas: editorState.history[newIndex],
        historyIndex: newIndex,
      });
    }
  };

  const redo = () => {
    if (editorState.historyIndex < editorState.history.length - 1) {
      const newIndex = editorState.historyIndex + 1;
      onStateChange({
        canvas: editorState.history[newIndex],
        historyIndex: newIndex,
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
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Tools</h3>
        <div className="grid grid-cols-2 gap-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => onStateChange({ tool: tool.id })}
                className={`flex items-center space-x-2 p-2 rounded-lg border transition-all duration-200 ${
                  editorState.tool === tool.id
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{tool.label}</span>
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

      {/* Actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>
        <div className="space-y-2">
          <button
            onClick={onSave}
            className="w-full flex items-center justify-center space-x-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200"
          >
            <Save className="h-4 w-4" />
            <span className="text-sm font-medium">Save</span>
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