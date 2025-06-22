import React, { useState, useEffect } from 'react';
import { Save, X, Upload, Eye, EyeOff } from 'lucide-react';
import { Canvas } from '../components/PixelEditor/Canvas';
import { ColorPalette } from '../components/PixelEditor/ColorPalette';
import { Toolbar } from '../components/PixelEditor/Toolbar';
import { EditorState, Layer } from '../types';
import { createEmptyCanvas, getDefaultPalette, downloadCanvas, resizeCanvas } from '../utils/pixelArt';
import { useAuth } from '../contexts/AuthContext';
import { PixelArtService } from '../services/pixelArtService';

interface EditorProps {
  onNavigate: (page: string) => void;
}

// --- レイヤー合成関数 ---
function hexToRgba(hex: string, alpha: number = 1) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  }
  return { r, g, b, a: alpha };
}

function mergeLayers(layers: Layer[], palette: string[], width: number, height: number): number[][] {
  // 下から上へvisibleなレイヤーをアルファブレンド
  const merged = createEmptyCanvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = { r: 0, g: 0, b: 0, a: 0 };
      let topIndex = 0;
      for (let l = 0; l < layers.length; l++) {
        const layer = layers[l];
        if (!layer.visible) continue;
        const colorIndex = layer.canvas[y][x];
        if (colorIndex > 0) {
          const hex = palette[colorIndex - 1];
          const fg = hexToRgba(hex, layer.opacity);
          // アルファブレンド
          const a = fg.a + color.a * (1 - fg.a);
          if (a > 0) {
            color = {
              r: Math.round((fg.r * fg.a + color.r * color.a * (1 - fg.a)) / a),
              g: Math.round((fg.g * fg.a + color.g * color.a * (1 - fg.a)) / a),
              b: Math.round((fg.b * fg.a + color.b * color.a * (1 - fg.a)) / a),
              a,
            };
            topIndex = colorIndex;
          }
        }
      }
      merged[y][x] = color.a > 0 ? topIndex : 0;
    }
  }
  return merged;
}

export const Editor: React.FC<EditorProps> = ({ onNavigate }) => {
  const { isAuthenticated, user } = useAuth();
  const [canvasSize, setCanvasSize] = useState({ width: 32, height: 32 });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveData, setSaveData] = useState({ title: '', description: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [sliderDragStart, setSliderDragStart] = useState<{x: number, y: number} | null>(null);
  const [isSliderActive, setIsSliderActive] = useState(false);

  const [editorState, setEditorState] = useState<EditorState>(() => {
    const initialCanvas = createEmptyCanvas(32, 32);
    const initialLayer: Layer = {
      id: 'layer-1',
      name: 'レイヤー 1',
      canvas: initialCanvas,
      opacity: 1,
      visible: true,
    };
    return {
      canvas: initialCanvas,
      palette: getDefaultPalette(),
      currentColor: 1,
      tool: 'brush',
      zoom: 1.2,
      history: [[{ ...initialLayer, canvas: initialCanvas.map(row => [...row]) }]],
      historyIndex: 0,
      layers: [initialLayer],
      currentLayer: 0,
    };
  });

  const updateEditorState = (newState: Partial<EditorState>) => {
    setEditorState(prev => {
      let next = { ...prev, ...newState };
      // canvasはlayers[currentLayer].canvasで常に同期
      if (next.layers && typeof next.currentLayer === 'number' && next.layers[next.currentLayer]) {
        next.canvas = next.layers[next.currentLayer].canvas;
      }
      return next;
    });
  };

  const handleCanvasSizeChange = (width: number, height: number) => {
    // すべてのレイヤーをresizeCanvas
    const newLayers = editorState.layers.map(layer => ({
      ...layer,
      canvas: resizeCanvas(layer.canvas, width, height),
    }));
    // 選択中レイヤーのcanvasを新しいサイズで取得
    const newCanvas = newLayers[editorState.currentLayer]?.canvas || createEmptyCanvas(width, height);
    const newState = {
      canvas: newCanvas,
      history: [newLayers],
      historyIndex: 0,
      layers: newLayers,
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
      // レイヤーを統合
      const merged = mergeLayers(
        editorState.layers,
        editorState.palette,
        canvasSize.width,
        canvasSize.height
      );
      await PixelArtService.uploadPixelArt(
        saveData.title || 'Untitled',
        saveData.description || '',
        merged,
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
    // レイヤーを統合
    const merged = mergeLayers(
      editorState.layers,
      editorState.palette,
      canvasSize.width,
      canvasSize.height
    );
    downloadCanvas(
      merged,
      editorState.palette,
      saveData.title ? `${saveData.title.replace(/[^a-zA-Z0-9]/g, '_')}.png` : 'pixel-art.png'
    );
  };

  const handleClear = () => {
    if (confirm('キャンバスをクリアしますか？この操作は元に戻せません。')) {
      const newCanvas = createEmptyCanvas(canvasSize.width, canvasSize.height);
      updateEditorState({
        history: [[{
          id: 'layer-1',
          name: 'レイヤー 1',
          canvas: newCanvas,
          opacity: 1,
          visible: true,
        }]],
        historyIndex: 0,
        layers: [{
          id: 'layer-1',
          name: 'レイヤー 1',
          canvas: newCanvas,
          opacity: 1,
          visible: true,
        }],
        currentLayer: 0,
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
                const newLayers = editorState.history[newIndex];
                updateEditorState({
                  layers: newLayers,
                  canvas: newLayers[editorState.currentLayer]?.canvas || newLayers[0].canvas,
                  historyIndex: newIndex,
                });
              }
            } else {
              // Undo
              if (editorState.historyIndex > 0) {
                const newIndex = editorState.historyIndex - 1;
                const newLayers = editorState.history[newIndex];
                updateEditorState({
                  layers: newLayers,
                  canvas: newLayers[editorState.currentLayer]?.canvas || newLayers[0].canvas,
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
  }, [editorState.historyIndex, editorState.history, editorState.currentLayer]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 見出し部分 */}
      <div className="w-full max-w-5xl mx-auto pt-8 pb-2 px-4">
        <div className="flex flex-row items-baseline gap-6 mb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-0">ドット絵エディター</h1>
          <p className="text-gray-600 text-lg mb-0">プロフェッショナルなツールで素晴らしいドット絵を作成しよう</p>
        </div>
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
      <div className="max-w-full mx-auto px-0 pt-1 pb-8 flex flex-row">
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
        <div className="flex-1 flex flex-col items-center justify-start">
          <div className="flex items-center justify-center w-full h-full min-h-[800px] flex-col mt-0">
            <Canvas
              editorState={editorState}
              onStateChange={updateEditorState}
              width={canvasSize.width}
              height={canvasSize.height}
            />
          </div>
        </div>
        {/* Right Sidebar: カラーパレット＋レイヤー */}
        <div className="w-[23rem] min-w-[320px] max-w-[380px] flex flex-col gap-6 bg-white rounded-xl shadow border p-4 h-fit mt-0 mr-16">
          <ColorPalette
            palette={editorState.palette}
            currentColor={editorState.currentColor}
            onColorChange={(colorIndex) => updateEditorState({ currentColor: colorIndex })}
            onPaletteChange={(newPalette) => updateEditorState({ palette: newPalette })}
          />
          {/* --- レイヤーUI（縦並び, ドラッグ対応） --- */}
          <div className="w-full mt-4 p-3 bg-white rounded-xl shadow flex flex-col gap-3 overflow-y-auto max-h-[400px]">
            {editorState.layers.slice().reverse().map((layer, revIdx) => {
              // reverseしているので、実際のidxは layers.length - 1 - revIdx
              const idx = editorState.layers.length - 1 - revIdx;
              return (
                <div
                  key={layer.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 select-none \
                    ${editorState.currentLayer === idx ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50 hover:border-indigo-300'} \
                    ${dragLayerIdx === idx ? 'opacity-60 border-indigo-400' : ''} \
                    ${dragOverIdx === idx && dragLayerIdx !== null && dragLayerIdx !== idx ? 'ring-2 ring-indigo-300' : ''}`}
                  draggable={!isSliderActive}
                  onDragStart={() => setDragLayerIdx(idx)}
                  onDragEnd={() => { setDragLayerIdx(null); setDragOverIdx(null); }}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                  onDragLeave={e => { e.preventDefault(); setDragOverIdx(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragLayerIdx === null || dragLayerIdx === idx) return;
                    const newLayers = [...editorState.layers];
                    const moved = newLayers.splice(dragLayerIdx, 1)[0];
                    newLayers.splice(idx, 0, moved);
                    let newCurrent = idx;
                    if (editorState.currentLayer === dragLayerIdx) newCurrent = idx;
                    else if (editorState.currentLayer > dragLayerIdx && editorState.currentLayer <= idx) newCurrent = editorState.currentLayer - 1;
                    else if (editorState.currentLayer < dragLayerIdx && editorState.currentLayer >= idx) newCurrent = editorState.currentLayer + 1;
                    else newCurrent = editorState.currentLayer;
                    updateEditorState({ layers: newLayers, currentLayer: newCurrent });
                    setDragLayerIdx(null); setDragOverIdx(null);
                  }}
                  style={{ cursor: 'grab' }}
                  onClick={() => updateEditorState({ currentLayer: idx, canvas: editorState.layers[idx].canvas })}
                >
                  <button
                    className={`w-6 h-6 flex items-center justify-center rounded-full border-2 transition-colors duration-150 \
                      ${layer.visible ? 'border-green-400 bg-green-50 text-green-600' : 'border-gray-300 bg-gray-100 text-gray-400'}`}
                    title={layer.visible ? '表示中' : '非表示'}
                    onClick={e => {
                      e.stopPropagation();
                      const newLayers = editorState.layers.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l);
                      updateEditorState({ layers: newLayers });
                    }}
                  >
                    {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <input
                    className="w-24 px-1 py-0.5 rounded border border-gray-200 text-sm bg-transparent focus:border-indigo-400"
                    value={layer.name}
                    onChange={e => {
                      e.stopPropagation();
                      const newLayers = editorState.layers.map((l, i) => i === idx ? { ...l, name: e.target.value } : l);
                      updateEditorState({ layers: newLayers });
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                  {editorState.layers.length > 1 && (
                    <button
                      className="ml-1 text-red-400 hover:text-red-600"
                      title="レイヤー削除"
                      onClick={e => {
                        e.stopPropagation();
                        const newLayers = editorState.layers.filter((_, i) => i !== idx);
                        let newCurrent = editorState.currentLayer;
                        if (newCurrent >= newLayers.length) newCurrent = newLayers.length - 1;
                        updateEditorState({ layers: newLayers, currentLayer: newCurrent, canvas: newLayers[newCurrent].canvas });
                      }}
                    >✕</button>
                  )}
                  {/* 不透明度スライダー */}
                  <div className="flex items-center gap-1 w-28">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={layer.opacity}
                      onChange={e => {
                        const newLayers = editorState.layers.map((l, i) => i === idx ? { ...l, opacity: parseFloat(e.target.value) } : l);
                        updateEditorState({ layers: newLayers });
                      }}
                      onPointerDown={e => {
                        setSliderDragStart({ x: e.clientX, y: e.clientY });
                        setIsSliderActive(true);
                        e.stopPropagation();
                      }}
                      onPointerMove={e => {
                        if (!sliderDragStart) return;
                        const dx = Math.abs(e.clientX - sliderDragStart.x);
                        const dy = Math.abs(e.clientY - sliderDragStart.y);
                        if (dx > dy) {
                          e.stopPropagation();
                        }
                      }}
                      onPointerUp={() => { setSliderDragStart(null); setIsSliderActive(false); }}
                      onPointerLeave={() => { setSliderDragStart(null); setIsSliderActive(false); }}
                      className="w-20 accent-indigo-500"
                    />
                    <span className="text-xs w-6 text-right">{Math.round(layer.opacity * 100)}%</span>
                  </div>
                </div>
              );
            })}
            <button
              className="mt-2 px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 font-bold"
              onClick={() => {
                const newLayer: Layer = {
                  id: `layer-${Date.now()}`,
                  name: `レイヤー ${editorState.layers.length + 1}`,
                  canvas: createEmptyCanvas(canvasSize.width, canvasSize.height),
                  opacity: 1,
                  visible: true,
                };
                updateEditorState({ layers: [...editorState.layers, newLayer], currentLayer: editorState.layers.length });
              }}
            >＋レイヤー追加</button>
          </div>
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