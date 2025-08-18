import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Clipboard } from 'lucide-react'
import { Canvas } from '../components/PixelEditor/Canvas';
import { ColorPalette } from '../components/PixelEditor/ColorPalette';
import { Toolbar } from '../components/PixelEditor/Toolbar';
import { EditorState, Layer } from '../types';
import { createEmptyCanvas, getDefaultPalette, downloadCanvas, resizeCanvas } from '../utils/pixelArt';
import { useAuth } from '../contexts/AuthContext';
import { PixelArtService } from '../services/pixelArtService';
import { useParams, useNavigate } from "react-router-dom";
import * as Y from 'yjs';
// @ts-ignore - type definitions may not be bundled
import { WebsocketProvider } from 'y-websocket';
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

// 受信データの安全化: キャンバス配列を常に width x height の2次元配列に整形
function ensure2DCanvas(input: any, width: number, height: number): number[][] {
  if (Array.isArray(input) && Array.isArray(input[0])) {
    // すでに2次元配列
    const arr = input as number[][];
    // サイズ不一致時は切り詰め/パディング
    const safe: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row = Array.isArray(arr[y]) ? arr[y].slice(0, width) : [];
      while (row.length < width) row.push(0);
      safe.push(row);
    }
    return safe;
  }
  if (Array.isArray(input)) {
    // 1次元配列 → チャンク
    const flat = (input as number[]).slice(0, width * height);
    while (flat.length < width * height) flat.push(0);
    const canvas: number[][] = [];
    for (let y = 0; y < height; y++) {
      canvas.push(flat.slice(y * width, (y + 1) * width));
    }
    return canvas;
  }
  // 不正データ → 空キャンバス
  return createEmptyCanvas(width, height);
}

const AUTO_SAVE_INTERVAL = 30000; // 30秒

const Editor: React.FC = () => {
  // すべてのフックを最上部で宣言
  const { user } = useAuth();
  const { artworkId } = useParams<{ artworkId: string }>();
  const navigate = useNavigate();
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 32, height: 32 });
  const initialEditorState = () => {
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
      tool: 'brush' as const,
      zoom: 1.2,
      history: [[{ ...initialLayer, canvas: initialCanvas.map(row => [...row]) }]],
      historyIndex: 0,
      layers: [initialLayer],
      currentLayer: 0,
      showGrid: true,
      backgroundPattern: 'light' as const,
      roomTitle: '無題',
    };
  };
  const [editorState, setEditorState] = useState<EditorState>(initialEditorState);
  const ydocRef = useRef<Y.Doc>();
  const providerRef = useRef<any>();
  const awarenessRef = useRef<any>();
  const [remoteCursors, setRemoteCursors] = useState<{ x: number; y: number; color?: string }[]>([]);
  const yLayersRef = useRef<Y.Array<any>>();
  const yCanvasSizeRef = useRef<Y.Map<any>>();
  const isYjsUpdateRef = useRef(false);
  const [backgroundPattern, setBackgroundPattern] = useState<'light' | 'dark'>('light');
  const [showGrid, setShowGrid] = useState(true);
  const yRoomTitleRef = useRef<Y.Text>();
  const [localRoomTitle, setLocalRoomTitle] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveData, setSaveData] = useState({ title: '', description: '' });
  const [isUploading, setIsUploading] = useState(false);
  // const [palettePos, setPalettePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  // const [lastAutoSave, setLastAutoSave] = useState<number>(Date.now());
  const [lassoMenuAction, setLassoMenuAction] = useState<null | 'copy' | 'delete' | 'move'>(null);
  const [showPostComplete, setShowPostComplete] = useState(false);

  // 新規作成時はリダイレクト
  useEffect(() => {
    if (!artworkId) {
      const newId = `room-${Date.now()}-${Math.floor(Math.random()*100000)}`;
      navigate(`/editor/${newId}`, { replace: true });
    }
  }, [artworkId, navigate]);

  // Yjsや状態初期化のuseEffectはartworkIdが存在する場合のみ
  useEffect(() => {
    if (!artworkId) return;
    // Provider初期化直前にartworkIdを出力
    console.log('Joining Yjs room:', artworkId);
    // YjsドキュメントとProvider初期化（まず y-websocket、失敗時に y-webrtc フォールバック）
    const ydoc = new Y.Doc();
    const ywsUrl = (import.meta as any).env?.VITE_YWS_URL || 'ws://localhost:1234';

    // Render 等の起動遅延を吸収するため、接続前にヘルスエンドポイントへウォームアップ
    const warmYws = async () => {
      try {
        const healthUrl = ywsUrl.replace(/^ws(s?):\/\//, 'http$1://') + '/healthz';
        await Promise.race([
          fetch(healthUrl, { mode: 'no-cors', cache: 'no-store' }),
          new Promise((resolve) => setTimeout(resolve as any, 1200))
        ]);
      } catch {}
    };
    try { warmYws().catch(() => {}); } catch {}

    let provider: any = new WebsocketProvider(ywsUrl, artworkId, ydoc, { connect: true, maxBackoffTime: 8000 });
    let wsConnected = false;
    const isConnected = (e: any) => {
      if (!e) return false;
      // y-websocket v1.x emits { status: 'connected' | 'disconnected' }
      if (typeof e.status === 'string') return e.status === 'connected';
      // y-websocket v3 emits { connected: boolean }
      if (typeof e.connected === 'boolean') return e.connected;
      // fallback: treat truthy as connected
      return Boolean(e);
    };
    const onStatus = (e: any) => {
      const connected = isConnected(e);
      console.log('Yjs status:', connected);
      wsConnected = connected;
    };
    provider.on('status', onStatus);
    const fallbackTimer = setTimeout(() => {
      if (!wsConnected) {
        try { provider.off?.('status', onStatus); provider.destroy?.(); } catch {}
        console.warn('y-websocket unreachable. Falling back to y-webrtc signaling...');
        provider = new WebrtcProvider(artworkId!, ydoc, {
          signaling: ['wss://pixelshare.fly.dev'],
          // Add public STUN servers for better NAT traversal
          peerOpts: {
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
              ]
            }
          }
        });
        provider.on('status', (e: any) => console.log('Yjs status:', isConnected(e)));
        // Debug peers count to verify P2P connectivity
        provider.on('peers', (e: any) => console.log('Yjs peers:', e.webrtcPeers, e.bcPeers));
        providerRef.current = provider;
      }
    }, 12000);
    ydocRef.current = ydoc;
    providerRef.current = provider;
    awarenessRef.current = (provider as any).awareness;
    // Awareness: listen remote cursor changes
    const awareness = awarenessRef.current;
    if (awareness) {
      const handleAwareness = () => {
        const states = Array.from(awareness.getStates().values());
        const cursors = states
          .map((s: any) => s?.cursor)
          .filter(Boolean);
        setRemoteCursors(cursors);
      };
      awareness.on('change', handleAwareness);
    }
    // Yjsで同期するデータ構造
    const yLayers = ydoc.getArray('layers');
    const yCanvasSize = ydoc.getMap('canvasSize');
    const yRoomTitle = ydoc.getText('roomTitle');
    yLayersRef.current = yLayers;
    yCanvasSizeRef.current = yCanvasSize;
    yRoomTitleRef.current = yRoomTitle;

    // Yjs→React state反映
    // Yjs→React 反映。origin==='local'（自分のtransact）由来は無視
    const updateFromYjs = (events?: any) => {
      try {
        if (Array.isArray(events)) {
          const isLocal = events.some((e: any) => e?.transaction?.origin === 'local');
          if (isLocal) return;
        }
      } catch {}
      if (isDrawingRef.current) return;
      isYjsUpdateRef.current = true;
      // 先にサイズを取得
      const width = Number(yCanvasSize.get('width')) || 32;
      const height = Number(yCanvasSize.get('height')) || 32;
      const layersRaw = yLayers.toArray();
      const seen = new Set<string>();
      const layers: Layer[] = (layersRaw as Layer[])
        .map(l => ({
          ...l,
          canvas: ensure2DCanvas((l as any).canvas, width, height)
        }))
        .filter(l => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
      const yTitle = yRoomTitle.toString();
      setEditorState(prev => {
        let changed = false;
        let next = { ...prev };
        if (JSON.stringify(prev.layers) !== JSON.stringify(layers)) {
          next.layers = layers;
          changed = true;
        }
        if (prev.roomTitle !== yTitle) {
          next.roomTitle = yTitle;
          setLocalRoomTitle(yTitle);
          changed = true;
        }
        return changed ? next : prev;
      });
      if (canvasSize.width !== width || canvasSize.height !== height) {
        setCanvasSize({ width, height });
      }
      setTimeout(() => {
        isYjsUpdateRef.current = false;
      }, 0);
    };
    yLayers.observeDeep(updateFromYjs as any);
    yCanvasSize.observeDeep(updateFromYjs as any);
    yRoomTitle.observe(updateFromYjs as any);

    let didInit = false;
    provider.on('synced', async (arg0: { synced: boolean }) => {
      if (didInit) return;
      didInit = true;
      const isSynced = arg0.synced;
      if (isSynced) {
        const yLayersArr = yLayers.toArray();
        const isAllZero = yLayersArr.length === 0 || yLayersArr.every(l => {
          const layer = l as any;
          if (Array.isArray(layer.canvas)) {
            const flat = layer.canvas.flat ? layer.canvas.flat() : layer.canvas;
            return flat.every((v: number) => v === 0);
          }
          return true;
        });
        if (isAllZero) {
          while (yLayers.length > 0) yLayers.delete(0, 1);
          const latest = await PixelArtService.getLatestState(artworkId);
          if (latest && latest.layers && latest.layers.length > 0) {
            const layers: Layer[] = (latest.layers as import('../types').LayerFirestore[]).map((l: import('../types').LayerFirestore) => ({
              ...l,
              canvas: PixelArtService.reshapeCanvas(l.canvas, latest.width, latest.height) as number[][]
            }));
            for (const layer of layers.slice(0, latest.layersCount || layers.length)) {
              yLayers.push([layer]);
            }
            yCanvasSize.set('width', latest.width);
            yCanvasSize.set('height', latest.height);
            yRoomTitle.insert(0, latest.roomTitle || '無題');
            updateFromYjs();
          } else {
            while (yLayers.length > 0) yLayers.delete(0, 1);
            const initState = initialEditorState();
            yLayers.push([{
              ...initState.layers[0],
              canvas: initState.layers[0].canvas.flat(),
            }]);
            yCanvasSize.set('width', initState.canvas[0].length);
            yCanvasSize.set('height', initState.canvas.length);
            yRoomTitle.insert(0, initState.roomTitle);
            updateFromYjs();
          }
        }
        // それ以外はYjsの内容でeditorStateを初期化（updateFromYjsが走る）
      }
    });

    // 初回: Yjsにデータがあれば必ずローカルstateをYjsの内容で上書き
    if (yLayers.length === 0) {
      const initState = initialEditorState();
      setEditorState(initState);
      // editorState.layersをIDで一意化してpush
      const uniqueInitLayers = [];
      const seenInit = new Set();
      for (const l of initState.layers) {
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
          canvas: ensure2DCanvas((l as any).canvas, Number(yCanvasSize.get('width')) || 32, Number(yCanvasSize.get('height')) || 32)
        }))
        .filter(l => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
      const width = Number(yCanvasSize.get('width')) || 32;
      const height = Number(yCanvasSize.get('height')) || 32;
      setCanvasSize({ width, height });
      if (layers.length > 0) {
        updateEditorState({ layers });
      }
    }
    // 初回反映
    updateFromYjs();
    // クリーンアップ
    return () => {
      try { clearTimeout(fallbackTimer); } catch {}
      // クリーンアップ時にFirestoreへ最新状態を保存（Yjsの内容を直接参照）
      if (artworkId && yLayersRef.current && yCanvasSizeRef.current) {
        const yLayers = yLayersRef.current;
        const yCanvasSize = yCanvasSizeRef.current;
        const layersRaw = yLayers.toArray();
        const layers = layersRaw.map((l: any) => ({
          id: l.id,
          name: l.name,
          canvas: Array.isArray(l.canvas) ? l.canvas.flat() : [],
          opacity: typeof l.opacity === 'number' && isFinite(l.opacity) ? l.opacity : 1,
          visible: typeof l.visible === 'boolean' ? l.visible : true,
        }));
        if (layers.length && !layers.every(l => l.canvas.every((v: number) => v === 0))) {
          const data = {
            layers,
            width: yCanvasSize.get('width') || 32,
            height: yCanvasSize.get('height') || 32,
            palette: editorState.palette,
            roomTitle: editorState.roomTitle,
            layersCount: layers.length, // レイヤー総数を追加
          };
          PixelArtService.saveLatestState(artworkId, data);
        }
      }
      yLayers.unobserveDeep(updateFromYjs);
      yCanvasSize.unobserveDeep(updateFromYjs);
      yRoomTitle.unobserve(updateFromYjs);
      if ((provider as any).destroy) (provider as any).destroy();
      ydoc.destroy();
    };
  }, [artworkId]);

  // Local cursor update -> awareness
  const handleCursorMove = (pos: { x: number; y: number } | null) => {
    const awareness = awarenessRef.current;
    if (!awareness) return;
    const me = awareness.getLocalState() || {};
    if (pos) {
      awareness.setLocalState({
        ...me,
        cursor: { x: pos.x, y: pos.y, color: '#00A3FF' },
      });
    } else {
      awareness.setLocalState({ ...me, cursor: null });
    }
  };

  // React state→Yjs反映（layers/roomTitle/canvasSize）
  useEffect(() => {
    if (isYjsUpdateRef.current) return;
    if (!yLayersRef.current || !yRoomTitleRef.current) return;
    const yLayers = yLayersRef.current;
    const yRoomTitle = yRoomTitleRef.current;
    // layers
    const layers = editorState.layers;
    const yLayerArr = yLayers.toArray();
    // const yLayerIds = new Set((yLayerArr as Layer[]).map(l => l.id));
    // 追加・更新
    (ydocRef.current as any)?.transact(() => {
      layers.forEach(l => {
        const idx = (yLayerArr as Layer[]).findIndex(yl => yl.id === l.id);
        if (idx === -1) {
          yLayers.push([l]);
        } else {
          // update: 既存レイヤーを置き換え
          if (JSON.stringify((yLayerArr as Layer[])[idx]) !== JSON.stringify(l)) {
            yLayers.delete(idx, 1);
            yLayers.insert(idx, [l]);
          }
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
      // roomTitle（違うときだけdelete→insert）
      const title = editorState.roomTitle || '無題';
      if (yRoomTitle.toString() !== title) {
        yRoomTitle.delete(0, yRoomTitle.length);
        yRoomTitle.insert(0, title);
      }
      // canvasSize 双方向同期（React -> Yjs）
      if (yCanvasSizeRef.current) {
        const yCanvasSize = yCanvasSizeRef.current;
        const w = Number(yCanvasSize.get('width')) || 0;
        const h = Number(yCanvasSize.get('height')) || 0;
        if (w !== canvasSize.width) yCanvasSize.set('width', canvasSize.width);
        if (h !== canvasSize.height) yCanvasSize.set('height', canvasSize.height);
      }
    }, 'local');
  }, [editorState.layers, editorState.roomTitle, canvasSize.width, canvasSize.height]);

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

  // ルームに入った時点で履歴に追加（タイトルは現時点のもの or 無題）
  useEffect(() => {
    if (!artworkId) return;
    saveRoomHistory(artworkId, editorState.roomTitle || '無題');
  }, [artworkId]);

  // 直接保存はやめ、下のデバウンス保存に一本化
  // useEffect(() => { ... });

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
    try {
      const merged = mergeLayers(
        editorState.layers,
        editorState.palette,
        canvasSize.width,
        canvasSize.height
      );
      const safeLayers = editorState.layers
        .filter(l => Array.isArray(l.canvas) && Array.isArray(l.canvas[0]))
        .map(l => ({ ...l, canvas: l.canvas.flat() }));
      // 必ず新規投稿（addDoc）
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
  // 自動保存(autoSave)やupdatePixelArtの呼び出しは削除

  // エディターステートが変化したら自動保存タイマーをリセット（デバウンス）
  useEffect(() => {
    if (!user || !artworkId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      try {
        // Firestoreに最新編集状態を保存（厳密バリデーション）
        const safeLayers = (Array.isArray(editorState.layers) ? editorState.layers : [])
          .filter(Boolean)
          .map(l => ({
            id: l.id,
            name: typeof l.name === 'string' ? l.name : '',
            canvas: Array.isArray(l.canvas)
              ? l.canvas.flat().map(v => (typeof v === 'number' && isFinite(v) ? v : 0))
              : Array(canvasSize.width * canvasSize.height).fill(0),
            opacity: typeof l.opacity === 'number' && isFinite(l.opacity) ? l.opacity : 1,
            visible: typeof l.visible === 'boolean' ? l.visible : true,
          }));
        if (!safeLayers.length || safeLayers.every(l => l.canvas.every(v => v === 0))) {
          return;
        }
        const safePalette = Array.isArray(editorState.palette)
          ? editorState.palette.filter(c => typeof c === 'string' && c)
          : getDefaultPalette();
        const data = {
          layers: safeLayers,
          width: typeof canvasSize.width === 'number' && isFinite(canvasSize.width) ? canvasSize.width : 32,
          height: typeof canvasSize.height === 'number' && isFinite(canvasSize.height) ? canvasSize.height : 32,
          palette: safePalette,
          roomTitle: typeof editorState.roomTitle === 'string' ? editorState.roomTitle : '無題',
          layersCount: safeLayers.length,
        };
        PixelArtService.saveLatestState(artworkId, data);
      } catch (e) {
        console.warn('debounced saveLatestState failed', e);
      }
    }, AUTO_SAVE_INTERVAL);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [editorState, canvasSize.width, canvasSize.height, user, artworkId]);

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
          onCursorMove={handleCursorMove}
          remoteCursors={remoteCursors}
        />
      </div>
      {/* 投稿完了ダイアログ */}
      {showPostComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
            <div className="text-2xl font-bold mb-2">投稿が完了しました！</div>
            <div className="mb-4 text-gray-600">ギャラリーで公開されました。</div>
            <div className="flex gap-4">
              <button
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                onClick={() => {
                  setShowPostComplete(false);
                }}
              >
                閉じる
              </button>
              <button
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                onClick={() => {
                  setShowPostComplete(false);
                  navigate('/mypage');
                }}
              >
                ギャラリーへ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 投稿入力ダイアログ */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center min-w-[320px]">
            <div className="text-xl font-bold mb-4">作品を投稿</div>
            <input
              className="mb-2 px-3 py-2 border rounded w-full"
              placeholder="タイトル"
              value={saveData.title}
              onChange={e => setSaveData({ ...saveData, title: e.target.value })}
              maxLength={40}
            />
            <textarea
              className="mb-4 px-3 py-2 border rounded w-full"
              placeholder="説明（任意）"
              value={saveData.description}
              onChange={e => setSaveData({ ...saveData, description: e.target.value })}
              maxLength={200}
              rows={3}
            />
            <div className="flex gap-4">
              <button
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                onClick={() => setShowSaveDialog(false)}
              >
                キャンセル
              </button>
              <button
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                onClick={handleSaveConfirm}
                disabled={isUploading}
              >
                {isUploading ? '投稿中...' : '投稿'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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