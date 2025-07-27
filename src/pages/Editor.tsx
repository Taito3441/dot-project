import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Upload, Eye, EyeOff, Clipboard } from 'lucide-react';
import { Canvas } from '../components/PixelEditor/Canvas';
import { ColorPalette } from '../components/PixelEditor/ColorPalette';
import { Toolbar } from '../components/PixelEditor/Toolbar';
import { EditorState, Layer } from '../types';
import { createEmptyCanvas, getDefaultPalette, downloadCanvas, resizeCanvas } from '../utils/pixelArt';
import { useAuth } from '../contexts/AuthContext';
import { PixelArtService } from '../services/pixelArtService';
import type { ColorPaletteProps } from '../components/PixelEditor/ColorPalette';
import { useParams } from "react-router-dom";
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { isDrawingRef } from '../components/PixelEditor/Canvas';

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

const AUTO_SAVE_INTERVAL = 30000; // 30秒

const Editor: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { artworkId } = useParams<{ artworkId: string }>();
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 32, height: 32 });
  const [editorState, setEditorState] = useState<EditorState>(() => {
    const initialCanvas = createEmptyCanvas(32, 32);
    const initialLayer: Layer = {
      id: `layer-${Date.now()}-${Math.floor(Math.random()*100000)}`,
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
      showGrid: true,
      backgroundPattern: 'light',
      roomTitle: '無題',
    };
  });
  // --- Yjs/Y-webrtc同期セットアップ ---
  const ydocRef = useRef<Y.Doc>();
  const providerRef = useRef<WebrtcProvider>();
  const yLayersRef = useRef<Y.Array<any>>();
  const yCanvasSizeRef = useRef<Y.Map<any>>();
  const isYjsUpdateRef = useRef(false);
  const [backgroundPattern, setBackgroundPattern] = useState<'light' | 'dark'>('light');
  const [showGrid, setShowGrid] = useState(true);
  const yRoomTitleRef = useRef<Y.Text>();
  const [localRoomTitle, setLocalRoomTitle] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  // 初期化（artworkIdが変わるたび）
  useEffect(() => {
    if (!artworkId) return;
    // YjsドキュメントとProvider初期化
    const ydoc = new Y.Doc();
    const provider = new WebrtcProvider(artworkId, ydoc, {
      signaling: ['wss://pixelshare.fly.dev'], // fly.ioのURLに合わせてください
    });
    ydocRef.current = ydoc;
    providerRef.current = provider;
    // Yjsで同期するデータ構造
    const yLayers = ydoc.getArray('layers');
    const yCanvasSize = ydoc.getMap('canvasSize');
    const yRoomTitle = ydoc.getText('roomTitle');
    yLayersRef.current = yLayers;
    yCanvasSizeRef.current = yCanvasSize;
    yRoomTitleRef.current = yRoomTitle;

    // Yjs→React state反映
    const updateFromYjs = () => {
      if (isDrawingRef.current) return; // ドラッグ中はlayers上書きをスキップ
      isYjsUpdateRef.current = true;
      const layersRaw = yLayers.toArray();
      const seen = new Set<string>();
      const layers: Layer[] = (layersRaw as Layer[])
        .map(l => ({
          ...l,
          canvas: Array.isArray(l.canvas) ? l.canvas : createEmptyCanvas(
            typeof (l as any).canvas?.[0]?.length === 'number' ? (l as any).canvas[0].length : 32,
            typeof (l as any).canvas?.length === 'number' ? (l as any).canvas.length : 32
          )
        }))
        .filter(l => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
      const widthRaw = yCanvasSize.get('width');
      const heightRaw = yCanvasSize.get('height');
      const width = typeof widthRaw === 'number' ? widthRaw : 32;
      const height = typeof heightRaw === 'number' ? heightRaw : 32;
      // 変更がある場合のみstateを更新
      if (JSON.stringify(editorState.layers) !== JSON.stringify(layers)) {
        updateEditorState({ layers });
      }
      if (canvasSize.width !== width || canvasSize.height !== height) {
        setCanvasSize({ width, height });
      }
      // タイトル同期
      const yTitle = yRoomTitle.toString();
      if (editorState.roomTitle !== yTitle) {
        isYjsUpdateRef.current = true;
        updateEditorState({ roomTitle: yTitle });
        setLocalRoomTitle(yTitle); // ローカル編集欄も同期
        isYjsUpdateRef.current = false;
      }
      isYjsUpdateRef.current = false;
    };
    yLayers.observeDeep(updateFromYjs);
    yCanvasSize.observeDeep(updateFromYjs);
    yRoomTitle.observe(updateFromYjs);

    // 初回: Yjsが空ならローカルstateをYjsにpush（同期完了後に判定）
    provider.on('synced', (arg0: { synced: boolean }) => {
      const isSynced = arg0.synced;
      if (isSynced && yRoomTitle.length === 0 && yRoomTitle.toString().length === 0) {
        yRoomTitle.insert(0, editorState.roomTitle || '無題');
      }
    });

    // 初回: Yjsにデータがあれば必ずローカルstateをYjsの内容で上書き
    if (yLayers.length === 0) {
      // editorState.layersをIDで一意化してpush
      const uniqueInitLayers = [];
      const seenInit = new Set();
      for (const l of editorState.layers) {
        if (!seenInit.has(l.id)) {
          uniqueInitLayers.push(l);
          seenInit.add(l.id);
        }
      }
      uniqueInitLayers.forEach(l => yLayers.push([l]));
      if (!yCanvasSize.get('width')) yCanvasSize.set('width', canvasSize.width);
      if (!yCanvasSize.get('height')) yCanvasSize.set('height', canvasSize.height);
    } else {
      // Yjsにデータがあれば必ずローカルstateをYjsの内容で上書き
      const layersRaw = yLayers.toArray();
      const seen = new Set<string>();
      const layers: Layer[] = (layersRaw as Layer[])
        .map(l => ({
          ...l,
          canvas: Array.isArray(l.canvas) ? l.canvas : createEmptyCanvas(
            typeof (l as any).canvas?.[0]?.length === 'number' ? (l as any).canvas[0].length : 32,
            typeof (l as any).canvas?.length === 'number' ? (l as any).canvas.length : 32
          )
        }))
        .filter(l => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
      const widthRaw = yCanvasSize.get('width');
      const heightRaw = yCanvasSize.get('height');
      const width = typeof widthRaw === 'number' ? widthRaw : 32;
      const height = typeof heightRaw === 'number' ? heightRaw : 32;
      setCanvasSize({ width, height });
      if (layers.length > 0) {
        updateEditorState({ layers });
      }
    }
    // 初回反映
    updateFromYjs();
    // クリーンアップ
    return () => {
      yLayers.unobserveDeep(updateFromYjs);
      yCanvasSize.unobserveDeep(updateFromYjs);
      yRoomTitle.unobserve(updateFromYjs);
      provider.destroy();
      ydoc.destroy();
    };
  }, [artworkId]);

  // React state→Yjs反映（layers/canvasSize/roomTitleのみ）
  useEffect(() => {
    if (!yLayersRef.current || !yCanvasSizeRef.current || !yRoomTitleRef.current) return;
    if (isYjsUpdateRef.current) return; // Yjs由来の更新なら何もしない
    // layers
    const yLayers = yLayersRef.current;
    const layers = editorState.layers;
    // Yjs側のIDリスト
    const yLayerArr = yLayers.toArray();
    const yLayerIds = new Set((yLayerArr as Layer[]).map(l => l.id));
    // 追加・更新
    layers.forEach(l => {
      const idx = (yLayerArr as Layer[]).findIndex(yl => yl.id === l.id);
      if (idx === -1) {
        yLayers.push([l]);
      } else {
        // update: 既存レイヤーを置き換え
        yLayers.delete(idx, 1);
        yLayers.insert(idx, [l]);
      }
    });
    // Yjsにしかないレイヤーは削除
    const toDelete: number[] = [];
    (yLayerArr as Layer[]).forEach((yl, idx) => {
      if (!layers.find(l => l.id === yl.id)) {
        toDelete.push(idx);
      }
    });
    toDelete.sort((a, b) => b - a); // 降順
    toDelete.forEach(idx => yLayers.delete(idx, 1));
    // canvasSize
    const yCanvasSize = yCanvasSizeRef.current;
    if (yCanvasSize.get('width') !== canvasSize.width) {
      yCanvasSize.set('width', canvasSize.width);
    }
    if (yCanvasSize.get('height') !== canvasSize.height) {
      yCanvasSize.set('height', canvasSize.height);
    }
    // roomTitle
    if (!yRoomTitleRef.current) return;
    if (isYjsUpdateRef.current) return; // Yjs由来の更新なら何もしない
    const yRoomTitle = yRoomTitleRef.current;
    const title = editorState.roomTitle || '無題';
    if (yRoomTitle.toString() !== title) {
      yRoomTitle.delete(0, yRoomTitle.length);
      yRoomTitle.insert(0, title);
    }
  }, [editorState.layers, canvasSize, editorState.roomTitle]);

  // 初回: Yjsが空ならinsertせず、UI上で「無題」と表示するだけ
  useEffect(() => {
    if (!yRoomTitleRef.current) return;
    const yRoomTitle = yRoomTitleRef.current;
    if (yRoomTitle.length === 0 && yRoomTitle.toString().length === 0) {
      setLocalRoomTitle('');
    } else {
      setLocalRoomTitle(yRoomTitle.toString());
    }
  }, [yRoomTitleRef.current]);

  // 履歴追加: artworkId/roomTitleが確定したら保存
  useEffect(() => {
    if (!artworkId) return;
    // editorState.roomTitleはYjs同期後に確定するので、roomTitleが空でなければ保存
    if (editorState.roomTitle && editorState.roomTitle.trim() !== '') {
      saveRoomHistory(artworkId, editorState.roomTitle);
    }
  }, [artworkId, editorState.roomTitle]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveData, setSaveData] = useState({ title: '', description: '' });
  const [isUploading, setIsUploading] = useState(false);
  // カラーパレットの座標を管理
  const [palettePos, setPalettePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const [lastAutoSave, setLastAutoSave] = useState<number>(Date.now());
  const [lassoMenuAction, setLassoMenuAction] = useState<null | 'copy' | 'delete' | 'move'>(null);

  // 投稿完了ダイアログ用の状態
  const [showPostComplete, setShowPostComplete] = useState(false);

  const updateEditorState = (newState: Partial<EditorState>) => {
    setEditorState(prev => {
      const next = { ...prev, ...newState };
      if (
        JSON.stringify(prev.layers) === JSON.stringify(next.layers) &&
        JSON.stringify(prev.canvas) === JSON.stringify(next.canvas) &&
        prev.currentLayer === next.currentLayer &&
        prev.historyIndex === next.historyIndex &&
        JSON.stringify(prev.palette) === JSON.stringify(next.palette) &&
        prev.currentColor === next.currentColor &&
        prev.tool === next.tool &&
        prev.roomTitle === next.roomTitle
      ) {
        return prev; // 変化がなければstateを更新しない
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
    setShowSaveDialog(true);
  };

  const handleSaveConfirm = async () => {
    if (!user) return;
    setIsUploading(true);
    try {
      const merged = mergeLayers(
        editorState.layers,
        editorState.palette,
        canvasSize.width,
        canvasSize.height
      );
      if (artworkId) {
        // 既存作品の上書き保存
        const safeLayers = editorState.layers
          .filter(l => Array.isArray(l.canvas) && Array.isArray(l.canvas[0]))
          .map(l => ({ ...l, canvas: l.canvas.flat() }));
        await PixelArtService.updatePixelArt(artworkId, {
          title: saveData.title || 'Untitled',
          description: saveData.description || '',
          pixelData: merged,
          width: canvasSize.width,
          height: canvasSize.height,
          palette: editorState.palette,
          isDraft: false,
          isPublic: true,
          layers: safeLayers as any,
          canvas: merged,
          user,
          roomId: artworkId,
          roomTitle: editorState.roomTitle || '無題',
        });
        setShowSaveDialog(false);
        setSaveData({ title: '', description: '' });
        setShowPostComplete(true);
      } else {
        // 新規作成
        const safeLayers = editorState.layers
          .filter(l => Array.isArray(l.canvas) && Array.isArray(l.canvas[0]))
          .map(l => ({ ...l, canvas: l.canvas.flat() }));
        await PixelArtService.uploadPixelArt(
          saveData.title || 'Untitled',
          saveData.description || '',
          merged,
          editorState.palette,
          user,
          false, // isDraft: false
          safeLayers as any,
          artworkId,
          editorState.roomTitle || '無題'
        );
        setShowSaveDialog(false);
        setSaveData({ title: '', description: '' });
        setShowPostComplete(true);
      }
    } catch (e) {
      alert('保存に失敗しました');
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

  // 自動保存関数
  const autoSave = async () => {
    if (!user) return;
    const merged = mergeLayers(
      editorState.layers,
      editorState.palette,
      canvasSize.width,
      canvasSize.height
    );
    try {
      const safeLayers = editorState.layers
        .filter(l => Array.isArray(l.canvas) && Array.isArray(l.canvas[0]))
        .map(l => ({ ...l, canvas: l.canvas.flat() }));
      if (artworkId) {
        // 既存作品の上書き保存
        await PixelArtService.updatePixelArt(artworkId, {
          title: saveData.title || 'Untitled',
          description: saveData.description || '',
          pixelData: merged,
          width: canvasSize.width,
          height: canvasSize.height,
          palette: editorState.palette,
          isDraft: false,
          isPublic: true,
          canvas: merged,
          user,
          layers: safeLayers as any,
          roomId: artworkId,
          roomTitle: editorState.roomTitle || '無題',
        });
      } else {
        // 新規作成（初回のみ）
        const newId = await PixelArtService.uploadPixelArt(
          saveData.title || 'Untitled',
          saveData.description || '',
          merged,
          editorState.palette,
          user,
          false, // isDraft
          safeLayers as any,
          artworkId,
          editorState.roomTitle || '無題'
        );
        // artworkIdをセットして以降は上書き保存
        // setArtworkId(newId); // artworkIdはuseParamsで管理
      }
      setLastAutoSave(Date.now());
    } catch (e) {
      // エラーは無視（UIには表示しない）
    }
  };

  useEffect(() => {
    if (!artworkId || !user) return;
    // 既存作品のロード
    PixelArtService.getUserArtworks(user.id).then(arts => {
      const art = arts.find(a => a.id === artworkId);
      if (art) {
        setSaveData({ title: art.title, description: art.description || '' });
        setCanvasSize({ width: art.width, height: art.height });
        // レイヤー情報を完全復元（canvasは必ず二次元配列に）
        let layers: Layer[];
        if (art.layers && Array.isArray(art.layers) && art.layers.length > 0) {
          layers = art.layers.map(l => ({ ...l, canvas: PixelArtService.reshapeCanvas(l.canvas, art.width, art.height) }));
        } else {
          layers = [{ id: `layer-${Date.now()}-${Math.floor(Math.random()*100000)}`, name: 'レイヤー 1', canvas: art.pixelData || createEmptyCanvas(art.width || 32, art.height || 32), opacity: 1, visible: true }];
        }
        setEditorState(prev => ({
          ...prev,
          canvas: layers[0]?.canvas || createEmptyCanvas(32, 32),
          palette: art.palette,
          layers,
          currentLayer: 0,
          history: [layers.map(l => ({ ...l, canvas: l.canvas?.map(row => [...row]) || createEmptyCanvas(32, 32) }))],
          historyIndex: 0,
        }));
      }
    });
  }, [artworkId, user]);

  // エディターステートが変化したら自動保存タイマーをリセット
  useEffect(() => {
    if (!user) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      autoSave();
    }, AUTO_SAVE_INTERVAL);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [editorState, saveData.title, saveData.description, canvasSize, user, artworkId]);

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

  // タイトルUI
  const COMMON_HEADER_HEIGHT = 64;
  const EDITOR_HEADER_HEIGHT = 72;
  const LEFT_SIDEBAR = 260;
  const RIGHT_SIDEBAR = 380;
  return (
    <div style={{ overflow: 'hidden', height: '100vh' }} className="relative w-full h-full">
      {/* 1. エディタ画面のヘッダー */}
      <div style={{ position: 'fixed', top: COMMON_HEADER_HEIGHT, left: 0, width: '100vw', height: EDITOR_HEADER_HEIGHT, zIndex: 100, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', padding: '0 32px' }}>
        {/* タイトル・シリアルコード・Canvas Size・Grid・Background・Actionsを横並びで配置 */}
        <div className="flex flex-row items-baseline gap-6 mb-4">
          <input
            className="text-3xl font-bold text-gray-900 mb-0 bg-transparent border-b-2 border-gray-200 focus:border-indigo-400 outline-none px-2 py-1"
            style={{ minWidth: 120, maxWidth: 400 }}
            value={localRoomTitle !== '' ? localRoomTitle : (editorState.roomTitle || '無題')}
            onChange={e => setLocalRoomTitle(e.target.value)}
            onBlur={() => {
              if (localRoomTitle !== '' && localRoomTitle !== editorState.roomTitle) updateEditorState({ roomTitle: localRoomTitle });
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && localRoomTitle !== '' && localRoomTitle !== editorState.roomTitle) {
                updateEditorState({ roomTitle: localRoomTitle });
                e.currentTarget.blur();
              }
            }}
            placeholder="無題"
          />
          {artworkId && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-base text-gray-500 select-all">シリアルコード: <span className="font-mono text-gray-700">{artworkId}</span></span>
              <button
                className="ml-2 px-2 py-1 rounded bg-gray-200 hover:bg-indigo-200 text-gray-700 text-sm flex items-center"
                onClick={() => {
                  navigator.clipboard.writeText(artworkId);
                  setCopyMsg('コピーしました');
                  setTimeout(() => setCopyMsg(''), 1500);
                }}
                title="シリアルコードをコピー"
              >
                <Clipboard className="w-4 h-4 mr-1" /> コピー
              </button>
              {copyMsg && <span className="text-green-600 text-xs ml-2">{copyMsg}</span>}
            </div>
          )}
        </div>
      </div>
      {/* 2. 左サイドバー */}
      <div style={{ position: 'fixed', left: 0, top: COMMON_HEADER_HEIGHT + EDITOR_HEADER_HEIGHT, height: `calc(100vh - ${COMMON_HEADER_HEIGHT + EDITOR_HEADER_HEIGHT}px)`, width: LEFT_SIDEBAR, zIndex: 10, background: '#fff', boxShadow: '2px 0 8px rgba(0,0,0,0.04)', overflow: 'auto' }}>
        <Toolbar
          editorState={editorState}
          onStateChange={updateEditorState}
          onSave={handleSave}
          onDownload={handleDownload}
          onClear={handleClear}
          onCanvasSizeChange={handleCanvasSizeChange}
          onLassoMenuAction={setLassoMenuAction as (action: 'copy' | 'delete' | 'move') => void}
          backgroundPattern={backgroundPattern}
          onBackgroundPatternChange={setBackgroundPattern}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
        />
      </div>
      {/* 3. 右サイドバー */}
      <div style={{ position: 'fixed', right: 0, top: COMMON_HEADER_HEIGHT + EDITOR_HEADER_HEIGHT, height: `calc(100vh - ${COMMON_HEADER_HEIGHT + EDITOR_HEADER_HEIGHT}px)`, width: RIGHT_SIDEBAR, zIndex: 10, background: '#fff', boxShadow: '-2px 0 8px rgba(0,0,0,0.04)', overflow: 'auto' }}>
        <ColorPalette
          palette={editorState.palette}
          currentColor={editorState.currentColor}
          onColorChange={(colorIndex) => updateEditorState({ currentColor: colorIndex })}
          onPaletteChange={(newPalette) => updateEditorState({ palette: newPalette })}
        />
        {/* レイヤー管理UIもここに移動 */}
        <div className="w-full" style={{marginTop: 16, width: 380, minWidth: 380, maxWidth: 380}}>
          <div className="p-3 bg-white rounded-xl shadow flex flex-col gap-3 overflow-y-auto max-h-[400px] border border-gray-200" style={{width: '100%'}}>
            {editorState.layers.slice().reverse().map((layer, revIdx) => {
              const idx = editorState.layers.length - 1 - revIdx;
              return (
                <div
                  key={layer.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 select-none \
                    ${editorState.currentLayer === idx ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50 hover:border-indigo-300'}`}
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
                      className="w-20 accent-indigo-500"
                    />
                    <span className="text-xs w-6 text-right">{Math.round(layer.opacity * 100)}%</span>
                  </div>
                </div>
              );
            })}
            <button
              className="mt-2 px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 font-bold w-full"
              onClick={() => {
                const newLayer: Layer = {
                  id: `layer-${Date.now()}-${Math.floor(Math.random()*100000)}`,
                  name: '新しいレイヤー',
                  canvas: createEmptyCanvas(canvasSize.width, canvasSize.height),
                  opacity: 1,
                  visible: true,
                };
                updateEditorState({ layers: [...editorState.layers, newLayer] });
              }}
            >
              レイヤーを追加
            </button>
          </div>
        </div>
      </div>
      {/* 4. 中央エリア */}
      <div style={{ marginTop: COMMON_HEADER_HEIGHT + EDITOR_HEADER_HEIGHT, marginLeft: LEFT_SIDEBAR, marginRight: RIGHT_SIDEBAR, height: `calc(100vh - ${COMMON_HEADER_HEIGHT + EDITOR_HEADER_HEIGHT}px)`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden' }}>
        <Canvas
          editorState={editorState}
          onStateChange={updateEditorState}
          width={canvasSize.width}
          height={canvasSize.height}
          lassoMenuAction={lassoMenuAction as 'copy' | 'delete' | 'move' | null}
          setLassoMenuAction={setLassoMenuAction as (action: null) => void}
          backgroundPattern={backgroundPattern}
          showGrid={showGrid}
        />
      </div>
    </div>
  );
};

// --- ここから履歴管理ユーティリティ ---
const HISTORY_KEY = 'dotart_room_history';
function saveRoomHistory(artworkId: string, title: string) {
  const now = new Date();
  const lastEdited = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  let history: any[] = [];
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {}
  // 既存があれば削除
  history = history.filter(h => h.artworkId !== artworkId);
  // 先頭に追加
  history.unshift({ artworkId, title, lastEdited });
  // 最大20件
  if (history.length > 20) history = history.slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export default Editor;