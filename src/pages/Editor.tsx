import React, { useState, useEffect } from 'react';
import { Save, X, Upload } from 'lucide-react';
import { Canvas } from '../components/PixelEditor/Canvas';
import { ColorPalette } from '../components/PixelEditor/ColorPalette';
import { Toolbar } from '../components/PixelEditor/Toolbar';
import { EditorState } from '../types';
import { createEmptyCanvas, getDefaultPalette, downloadCanvas } from '../utils/pixelArt';
import { useAuth } from '../contexts/AuthContext';
import { PixelArtService } from '../services/pixelArtService';

interface EditorProps {
  onNavigate: (page: string) => void;
}

export const Editor: React.FC<EditorProps> = ({ onNavigate }) => {
  const { isAuthenticated, user } = useAuth();
  const [canvasSize, setCanvasSize] = useState({ width: 32, height: 32 });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveData, setSaveData] = useState({ title: '', description: '' });
  const [isUploading, setIsUploading] = useState(false);

  const [editorState, setEditorState] = useState<EditorState>(() => {
    const initialCanvas = createEmptyCanvas(32, 32);
    return {
      canvas: initialCanvas,
      palette: getDefaultPalette(),
      currentColor: 1,
      tool: 'brush',
      zoom: 1,
      history: [initialCanvas],
      historyIndex: 0,
    };
  });

  const updateEditorState = (newState: Partial<EditorState>) => {
    setEditorState(prev => ({ ...prev, ...newState }));
  };

  const handleCanvasSizeChange = (width: number, height: number) => {
    const newCanvas = createEmptyCanvas(width, height);
    const newState = {
      canvas: newCanvas,
      history: [newCanvas],
      historyIndex: 0,
    };
    setCanvasSize({ width, height });
    updateEditorState(newState);
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      onNavigate('auth');
      return;
    }
    setShowSaveDialog(true);
  };

  const handleSaveConfirm = async () => {
    if (!user) return;

    setIsUploading(true);
    try {
      await PixelArtService.uploadPixelArt(
        saveData.title || 'Untitled',
        saveData.description || '',
        editorState.canvas,
        editorState.palette,
        user
      );
      
      setShowSaveDialog(false);
      setSaveData({ title: '', description: '' });
      
      // Show success message
      alert('作品が正常にアップロードされました！');
      
      // Navigate to gallery
      onNavigate('gallery');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('アップロードに失敗しました。もう一度お試しください。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = () => {
    downloadCanvas(
      editorState.canvas,
      editorState.palette,
      saveData.title ? `${saveData.title.replace(/[^a-zA-Z0-9]/g, '_')}.png` : 'pixel-art.png'
    );
  };

  const handleClear = () => {
    if (confirm('キャンバスをクリアしますか？この操作は元に戻せません。')) {
      const newCanvas = createEmptyCanvas(canvasSize.width, canvasSize.height);
      updateEditorState({
        canvas: newCanvas,
        history: [newCanvas],
        historyIndex: 0,
      });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              // Redo
              if (editorState.historyIndex < editorState.history.length - 1) {
                const newIndex = editorState.historyIndex + 1;
                updateEditorState({
                  canvas: editorState.history[newIndex],
                  historyIndex: newIndex,
                });
              }
            } else {
              // Undo
              if (editorState.historyIndex > 0) {
                const newIndex = editorState.historyIndex - 1;
                updateEditorState({
                  canvas: editorState.history[newIndex],
                  historyIndex: newIndex,
                });
              }
            }
            break;
          case 's':
            e.preventDefault();
            handleSave();
            break;
        }
      } else {
        switch (e.key.toLowerCase()) {
          case 'b':
            updateEditorState({ tool: 'brush' });
            break;
          case 'e':
            updateEditorState({ tool: 'eraser' });
            break;
          case 'i':
            updateEditorState({ tool: 'eyedropper' });
            break;
          case 'f':
            updateEditorState({ tool: 'fill' });
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [editorState.historyIndex, editorState.history]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 見出し部分 */}
      <div className="w-full max-w-5xl mx-auto pt-8 pb-2 px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ドット絵エディター</h1>
        <p className="text-gray-600 mb-4">プロフェッショナルなツールで素晴らしいドット絵を作成しよう</p>
        <div className="flex items-center space-x-4 absolute right-8 top-8">
          <label className="text-sm font-medium text-gray-700">サイズ:</label>
          <select
            value={`${canvasSize.width}x${canvasSize.height}`}
            onChange={(e) => {
              const [width, height] = e.target.value.split('x').map(Number);
              handleCanvasSizeChange(width, height);
            }}
            className="border border-gray-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="16x16">16×16</option>
            <option value="32x32">32×32</option>
            <option value="64x64">64×64</option>
            <option value="128x128">128×128</option>
          </select>
        </div>
      </div>
      {/* エディタ本体 */}
      <div className="max-w-full mx-auto px-0 pt-4 pb-8 flex flex-row">
        {/* Left Sidebar: ツール */}
        <div className="w-64 min-w-[220px] max-w-[320px] flex flex-col gap-6 bg-white rounded-xl shadow border p-4 h-fit mt-4 ml-8">
          <Toolbar
            editorState={editorState}
            onStateChange={updateEditorState}
            onSave={handleSave}
            onDownload={handleDownload}
            onClear={handleClear}
          />
        </div>
        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center justify-center w-full h-full min-h-[600px]">
            <Canvas
              editorState={editorState}
              onStateChange={updateEditorState}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          </div>
        </div>
        {/* Right Sidebar: カラーパレット */}
        <div className="w-96 min-w-[340px] max-w-[420px] flex flex-col gap-6 bg-white rounded-xl shadow border p-4 h-fit mt-4 mr-16">
          <ColorPalette
            palette={editorState.palette}
            currentColor={editorState.currentColor}
            onColorChange={(colorIndex) => updateEditorState({ currentColor: colorIndex })}
            onPaletteChange={(newPalette) => updateEditorState({ palette: newPalette })}
          />
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">作品を投稿</h3>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                disabled={isUploading}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  タイトル *
                </label>
                <input
                  type="text"
                  value={saveData.title}
                  onChange={(e) => setSaveData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="作品のタイトルを入力"
                  disabled={isUploading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  説明
                </label>
                <textarea
                  value={saveData.description}
                  onChange={(e) => setSaveData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="作品の説明（任意）"
                  disabled={isUploading}
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowSaveDialog(false)}
                disabled={isUploading}
                className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveConfirm}
                disabled={!saveData.title || isUploading}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isUploading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    アップロード中...
                  </div>
                ) : (
                  <>
                    <Upload className="h-4 w-4 inline mr-2" />
                    投稿する
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};