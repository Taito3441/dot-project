import React, { useRef, useEffect, useState } from 'react';
import { EditorState } from '../../types';
import { floodFill } from '../../utils/pixelArt';
import { createEmptyCanvas } from '../../utils/pixelArt';

interface CanvasProps {
  editorState: EditorState;
  onStateChange: (newState: Partial<EditorState>) => void;
  width: number;
  height: number;
  lassoMenuAction?: 'copy' | 'delete' | 'move' | null;
  setLassoMenuAction?: (action: null) => void;
  backgroundPattern: 'light' | 'dark';
  showGrid: boolean;
  onCursorMove?: (pos: { x: number; y: number } | null) => void;
  remoteCursors?: { x: number; y: number; color?: string }[];
  // 受信側の部分再描画用
  dirtyRects?: { x: number; y: number; w: number; h: number }[];
  dirtyTick?: number; // 変更カウンタ
}

// type Layer = {
//   id: string;
//   name: string;
//   canvas: number[][];
//   opacity: number; // 0~1
//   visible: boolean;
// };

export const isDrawingRef = { current: false };

export const Canvas: React.FC<CanvasProps> = ({
  editorState,
  onStateChange,
  width,
  height,
  lassoMenuAction,
  setLassoMenuAction,
  backgroundPattern,
  showGrid,
  onCursorMove,
  remoteCursors,
  dirtyRects,
  dirtyTick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const canvasDataRef = useRef<number[][]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [linePreview, setLinePreview] = useState<{ x: number; y: number } | null>(null);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectPreview, setRectPreview] = useState<{ x: number; y: number } | null>(null);
  const [ellipseStart, setEllipseStart] = useState<{ x: number; y: number } | null>(null);
  const [ellipsePreview, setEllipsePreview] = useState<{ x: number; y: number } | null>(null);
  const [isMovingCanvas, setIsMovingCanvas] = useState(false);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [moveOffset, setMoveOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  // --- 投げ縄用 state ---
  const [lassoSelections, setLassoSelections] = useState<{ x: number; y: number }[][]>(editorState.lassoSelections || []);
  const currentLassoRef = useRef<{ x: number; y: number }[]>([]);
  const isLassoingRef = useRef(false);
  const lastLassoPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isLassoing, setIsLassoing] = useState(false);
  // lassoMode: 'idle' | 'copying' | 'moving' に拡張
  const [lassoMode, setLassoMode] = useState<'idle' | 'copying' | 'moving'>('idle');
  const [lassoDragStart, setLassoDragStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoDragOffset, setLassoDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // --- プレビュー用キャッシュ ---
  const lassoPixelCache = useRef<{ x: number; y: number; colorIndex: number }[]>([]);

  // 移動・コピー開始時にキャッシュを作成
  useEffect(() => {
    if ((lassoMode === 'copying' || lassoMode === 'moving') && lassoSelections.length > 0) {
      const layer = editorState.layers[editorState.currentLayer];
      const cache: { x: number; y: number; colorIndex: number }[] = [];
      for (const region of lassoSelections) {
        for (const { x, y } of region) {
          const w = layer.canvas?.[0]?.length || 0;
          const h = layer.canvas?.length || 0;
          if (x >= 0 && x < w && y >= 0 && y < h) {
            cache.push({ x, y, colorIndex: layer.canvas[y][x] });
          }
        }
      }
      lassoPixelCache.current = cache;
    } else {
      lassoPixelCache.current = [];
    }
  }, [lassoMode, lassoSelections, editorState.layers, editorState.currentLayer]);

  // lassoModeの変更時に親に伝える
  useEffect(() => {
    onStateChange({ lassoMode });
    // eslint-disable-next-line
  }, [lassoMode]);

  const pixelSize = Math.min(720 / Math.max(width, height) * editorState.zoom, 56);
  const canvasWidth = width * pixelSize;
  const canvasHeight = height * pixelSize;

  useEffect(() => {
    // 選択中レイヤーのcanvasで初期化
    const layer = editorState.layers[editorState.currentLayer];
    if (layer) {
      canvasDataRef.current = layer.canvas.map(row => [...row]);
    }
  }, [editorState.currentLayer, editorState.layers, width, height]);

  useEffect(() => {
    drawCanvas();
  }, [editorState.canvas, editorState.palette, pixelSize, editorState.layers, editorState.currentLayer, showGrid, backgroundPattern]);

  useEffect(() => {
    currentLassoRef.current = currentLassoRef.current;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- キーボードショートカット ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete/Backspaceで選択範囲消去
      if ((e.key === 'Delete' || e.key === 'Backspace') && editorState.tool === 'lasso' && lassoSelections.length > 0) {
        const newLayers = editorState.layers.map((l, i) => {
          if (i !== editorState.currentLayer) return l;
          const canvas = l.canvas.map(row => [...row]);
          for (const region of lassoSelections) {
            for (const { x, y } of region) {
              if (x >= 0 && x < canvas[0].length && y >= 0 && y < canvas.length) {
                canvas[y][x] = 0;
              }
            }
          }
          return { ...l, canvas };
        });
        onStateChange({ layers: newLayers });
        setLassoSelections([]);
        currentLassoRef.current = [];
        setIsLassoing(false);
        setLassoMode('idle');
        setLassoDragStart(null);
        setLassoDragOffset({ x: 0, y: 0 });
      }
      // Escで選択解除
      if (e.key === 'Escape' && editorState.tool === 'lasso') {
        setLassoSelections([]);
        currentLassoRef.current = [];
        setIsLassoing(false);
        setLassoMode('idle');
        setLassoDragStart(null);
        setLassoDragOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorState.tool, lassoSelections, editorState.layers]);

  // 他ツール選択時の解除
  useEffect(() => {
    if (editorState.tool !== 'lasso') {
      setLassoSelections([]);
      currentLassoRef.current = [];
      setIsLassoing(false);
      setLassoMode('idle');
      setLassoDragStart(null);
      setLassoDragOffset({ x: 0, y: 0 });
      lastLassoPointRef.current = null;
      isLassoingRef.current = false;
      lassoPixelCache.current = [];
      drawCanvas(); // 状態リセット直後に必ず再描画
    }
  }, [editorState.tool]);

  // --- プルダウンメニューからの操作 ---
  useEffect(() => {
    if (!lassoMenuAction) return;
    if (lassoMenuAction === 'copy') {
      if (lassoSelections.length > 0) {
        setLassoMode('copying');
        // コピー開始時、基準点を未セット状態に
        setLassoDragStart(null);
        setLassoDragOffset({ x: 0, y: 0 });
      } else {
        setLassoMode('idle');
      }
    }
    if (lassoMenuAction === 'move') {
      if (lassoSelections.length > 0) {
        setLassoMode('moving');
        // 移動開始時、基準点を未セット状態に
        setLassoDragStart(null);
        setLassoDragOffset({ x: 0, y: 0 });
      } else {
        setLassoMode('idle');
      }
    }
    setLassoMenuAction && setLassoMenuAction(null);
  }, [lassoMenuAction, lassoSelections]);

  // スナップ関数: 水平・垂直・45度
  const getSnappedLineEnd = (start: { x: number, y: number }, end: { x: number, y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return end;
    const angle = Math.atan2(dy, dx);
    // 0:水平, π/4:45度, π/2:垂直, -π/4:-45度
    const directions = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4, Math.PI, 3 * Math.PI / 4];
    let minDiff = Infinity;
    let snappedAngle = 0;
    for (const dir of directions) {
      let diff = Math.abs(angle - dir);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < minDiff) {
        minDiff = diff;
        snappedAngle = dir;
      }
    }
    // 距離
    const len = Math.round(Math.sqrt(dx * dx + dy * dy));
    // 方向ごとにx,yの増分を決定
    let snapDx = 0, snapDy = 0;
    if (Math.abs(snappedAngle) < 0.0001 || Math.abs(Math.abs(snappedAngle) - Math.PI) < 0.0001) {
      // 水平
      snapDx = dx > 0 ? len : -len;
      snapDy = 0;
    } else if (Math.abs(Math.abs(snappedAngle) - Math.PI / 2) < 0.0001) {
      // 垂直
      snapDx = 0;
      snapDy = dy > 0 ? len : -len;
    } else {
      // 45度
      snapDx = dx > 0 ? len : -len;
      snapDy = dy > 0 ? len : -len;
      // 45度方向に合わせて長さを調整
      const minLen = Math.min(Math.abs(dx), Math.abs(dy));
      snapDx = dx > 0 ? minLen : -minLen;
      snapDy = dy > 0 ? minLen : -minLen;
    }
    return { x: start.x + snapDx, y: start.y + snapDy };
  };

  // 正方形スナップ関数
  const getSnappedRectEnd = (start: { x: number, y: number }, end: { x: number, y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const size = Math.max(absDx, absDy);
    return {
      x: start.x + (dx >= 0 ? size : -size),
      y: start.y + (dy >= 0 ? size : -size),
    };
  };

  // 正円スナップ関数
  const getSnappedEllipseEnd = (start: { x: number, y: number }, end: { x: number, y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const size = Math.max(absDx, absDy);
    return {
      x: start.x + (dx >= 0 ? size : -size),
      y: start.y + (dy >= 0 ? size : -size),
    };
  };

  const hexToRgba = (hex: string, alpha: number = 1) => {
    // #RRGGBB or #RGB
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
  };

  // アルファブレンド: fg over bg
  const blend = (fg: {r:number,g:number,b:number,a:number}, bg: {r:number,g:number,b:number,a:number}) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
      g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
      b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
      a,
    };
  };

  const drawCanvas = () => {
    if (!editorState.layers || editorState.layers.length === 0) return;
    const layer = editorState.layers[editorState.currentLayer];
    if (!layer || !layer.canvas || !Array.isArray(layer.canvas) || !Array.isArray(layer.canvas[0])) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw background grid (市松模様)
    const gridSize = Math.max(4, Math.floor(pixelSize / 3));
    const isDark = backgroundPattern === 'dark';
    const colorA = isDark ? '#111' : '#f3f4f6';
    const colorB = isDark ? '#222' : '#e5e7eb';
    for (let y = 0; y < canvasHeight; y += gridSize) {
      for (let x = 0; x < canvasWidth; x += gridSize) {
        ctx.fillStyle = ((x / gridSize + y / gridSize) % 2 === 0) ? colorA : colorB;
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }

    // Draw grid lines
    if (showGrid) {
      ctx.strokeStyle = editorState.backgroundPattern === 'dark' ? '#fff' : '#000';
      ctx.lineWidth = 0.25;
      for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * pixelSize, 0);
        ctx.lineTo(x * pixelSize, canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * pixelSize);
        ctx.lineTo(canvasWidth, y * pixelSize);
        ctx.stroke();
      }
    }

    // --- レイヤー合成 ---
    // 下から上へvisibleなレイヤーを合成
    const layers = editorState.layers;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 背景: 完全透明
        let color = { r: 0, g: 0, b: 0, a: 0 };
        for (let l = 0; l < layers.length; l++) {
          const layer = layers[l];
          if (!layer.visible) continue;
          // 現在編集中のレイヤーだけはcanvasDataRef.currentを参照
          const canvas = (l === editorState.currentLayer) ? canvasDataRef.current : layer.canvas;
          const colorIndex = canvas[y][x];
          if (colorIndex > 0) {
            const hex = editorState.palette[colorIndex - 1];
            const fg = hexToRgba(hex, layer.opacity);
            color = blend(fg, color);
          }
        }
        if (color.a > 0) {
          ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a})`;
          ctx.fillRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
        }
      }
    }
    // --- 投げ縄選択範囲の描画 ---
    if (editorState.tool === 'lasso' && (lassoSelections.length > 0 || currentLassoRef.current.length > 0)) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        ctx.save();
        if ((lassoMode === 'copying' || lassoMode === 'moving') && lassoPixelCache.current.length > 0) {
          // プレビュー: キャッシュしたピクセルのみ描画
          for (const { x, y, colorIndex } of lassoPixelCache.current) {
            // コピー/移動中は元の位置を消す
            ctx.clearRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
            // プレビュー先
            const nx = x + lassoDragOffset.x;
            const ny = y + lassoDragOffset.y;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (colorIndex > 0) {
                const hex = editorState.palette[colorIndex - 1];
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = hex;
                ctx.fillRect(nx * pixelSize + 1, ny * pixelSize + 1, pixelSize - 2, pixelSize - 2);
                ctx.globalAlpha = 1.0;
              }
              // 透明でも必ず点線枠を描画
              ctx.strokeStyle = '#22c55e';
              ctx.setLineDash([2, 2]);
              ctx.lineWidth = 4;
              ctx.strokeRect(nx * pixelSize + 1, ny * pixelSize + 1, pixelSize - 2, pixelSize - 2);
              ctx.setLineDash([]);
            }
          }
        } else {
          // 通常の投げ縄選択範囲
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#fffbe6';
          for (const region of [...lassoSelections, currentLassoRef.current]) {
            for (const { x, y } of region) {
              ctx.fillRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
            }
          }
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = '#f59e42';
          ctx.setLineDash([2, 2]);
          ctx.lineWidth = 2;
          for (const region of [...lassoSelections, currentLassoRef.current]) {
            for (const { x, y } of region) {
              ctx.strokeRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
            }
          }
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
  };

  // 矩形領域だけ再描画
  const drawRects = (rects: { x: number; y: number; w: number; h: number }[]) => {
    if (!editorState.layers || editorState.layers.length === 0) return;
    const layer = editorState.layers[editorState.currentLayer];
    if (!layer || !Array.isArray(layer.canvas) || !Array.isArray(layer.canvas[0])) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;

    // 背景とグリッドをそのまま維持したいので、対象矩形だけクリア→再塗り
    rects.forEach(r => {
      const rx = Math.max(0, r.x), ry = Math.max(0, r.y);
      const rw = Math.min(r.w, width - rx), rh = Math.min(r.h, height - ry);
      if (rw <= 0 || rh <= 0) return;
      // 背景市松
      const gridSize = Math.max(4, Math.floor(pixelSize / 3));
      const isDark = backgroundPattern === 'dark';
      const colorA = isDark ? '#111' : '#f3f4f6';
      const colorB = isDark ? '#222' : '#e5e7eb';
      // 背景再描画
      for (let yy = ry * pixelSize; yy < (ry + rh) * pixelSize; yy += gridSize) {
        for (let xx = rx * pixelSize; xx < (rx + rw) * pixelSize; xx += gridSize) {
          ctx.fillStyle = (((xx / gridSize) + (yy / gridSize)) % 2 === 0) ? colorA : colorB;
          ctx.fillRect(xx, yy, gridSize, gridSize);
        }
      }
      // グリッド線
      if (showGrid) {
        ctx.strokeStyle = editorState.backgroundPattern === 'dark' ? '#fff' : '#000';
        ctx.lineWidth = 0.25;
        for (let x = rx; x <= rx + rw; x++) {
          ctx.beginPath(); ctx.moveTo(x * pixelSize, ry * pixelSize); ctx.lineTo(x * pixelSize, (ry + rh) * pixelSize); ctx.stroke();
        }
        for (let y = ry; y <= ry + rh; y++) {
          ctx.beginPath(); ctx.moveTo(rx * pixelSize, y * pixelSize); ctx.lineTo((rx + rw) * pixelSize, y * pixelSize); ctx.stroke();
        }
      }
      // ピクセル合成
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          let color = { r: 0, g: 0, b: 0, a: 0 };
          for (let l = 0; l < editorState.layers.length; l++) {
            const lyr = editorState.layers[l]; if (!lyr.visible) continue;
            const can = (l === editorState.currentLayer) ? canvasDataRef.current : lyr.canvas;
            const colorIndex = can?.[y]?.[x] || 0;
            if (colorIndex > 0) {
              const hex = editorState.palette[colorIndex - 1];
              const fg = hexToRgba(hex, lyr.opacity);
              color = blend(fg, color);
            }
          }
          if (color.a > 0) {
            ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            ctx.fillRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
          } else {
            // 透明ならセルをクリア
            ctx.clearRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
          }
        }
      }
    });
  };

  // 受信差分トリガで部分再描画
  useEffect(() => {
    if (!dirtyRects || !dirtyRects.length) return;
    drawRects(dirtyRects);
    // eslint-disable-next-line
  }, [dirtyTick]);

  const getPixelCoordinates = (event: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / pixelSize);
    const y = Math.floor((event.clientY - rect.top) / pixelSize);

    if (x >= 0 && x < width && y >= 0 && y < height) {
      return { x, y };
    }
    return null;
  };

  const saveToHistory = () => {
    const newHistory = editorState.history.slice(0, editorState.historyIndex + 1);
    // layers全体をディープコピーして保存
    const layersCopy = editorState.layers.map(layer => ({
      ...layer,
      canvas: Array.isArray(layer.canvas) && Array.isArray(layer.canvas[0])
        ? layer.canvas.map(row => [...row])
        : createEmptyCanvas(width, height),
    }));
    newHistory.push(layersCopy);
    onStateChange({
      history: newHistory.slice(-50), // Keep last 50 states
      historyIndex: Math.min(newHistory.length, 49),
    });
  };

  const drawPixelDirect = (x: number, y: number, erase = false) => {
    if (erase) {
      canvasDataRef.current[y][x] = 0;
      return;
    }
    const colorIndex = editorState.currentColor;
    canvasDataRef.current[y][x] = colorIndex;
  };

  // --- ドキュメント全体でmousemove/upを監視する投げ縄 ---
  const handleLassoMouseMove = (event: MouseEvent) => {
    if (!isLassoingRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.floor((event.clientX - rect.left) / pixelSize);
    const y = Math.floor((event.clientY - rect.top) / pixelSize);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const coords = { x, y };
    if (!lastLassoPointRef.current) {
      lastLassoPointRef.current = coords;
    }
    const last = lastLassoPointRef.current;
    const points: { x: number; y: number }[] = [];
    const dx = coords.x - last.x;
    const dy = coords.y - last.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i++) {
      const nx = last.x + Math.round((dx * i) / steps);
      const ny = last.y + Math.round((dy * i) / steps);
      points.push({ x: nx, y: ny });
    }
    // 既存のcurrentLassoRefに新しい点を追加
    const prev = currentLassoRef.current;
    const newPoints = points.filter(
      (p) => !prev.some((q) => q.x === p.x && q.y === p.y)
    );
    currentLassoRef.current = [...prev, ...newPoints];
    lastLassoPointRef.current = coords;
    window.requestAnimationFrame(drawCanvas);
  };

  const handleLassoMouseUp = () => {
    setIsLassoing(false);
    isLassoingRef.current = false;
    lastLassoPointRef.current = null;
    window.removeEventListener('mousemove', handleLassoMouseMove);
    window.removeEventListener('mouseup', handleLassoMouseUp);
    if (editorState.tool === 'lasso') {
      if (currentLassoRef.current.length > 0) {
        setLassoSelections((prev) => [...prev, [...currentLassoRef.current]]);
        // currentLassoRef.currentはここでクリアしない（次のmousedownまで保持）
        window.requestAnimationFrame(drawCanvas);
      }
    }
  };

  // 1. 移動モード時、選択範囲内クリックでドラッグ開始
  // const isInLassoSelection = (coords: { x: number; y: number }) => {
  //   for (const region of lassoSelections) {
  //     for (const { x, y } of region) {
  //       if (coords.x === x + lassoDragOffset.x && coords.y === y + lassoDragOffset.y) {
  //         return true;
  //       }
  //     }
  //   }
  //   return false;
  // };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) return; // ホイールボタンはツール操作を一切無効化
    if (isPanning) return; // パン中は描画操作を無効化
    const coords = getPixelCoordinates(event);
    if (!coords) return;

    // --- 投げ縄ツール ---
    if (editorState.tool === 'lasso') {
      // コピー中で選択範囲があり、基準点が未セットなら、クリック位置を基準点にしてドラッグ開始
      if (lassoMode === 'copying' && lassoSelections.length > 0 && !lassoDragStart) {
        setLassoDragStart(coords);
        setLassoDragOffset({ x: 0, y: 0 });
        setIsLassoing(true);
        return;
      }
      // コピー中で選択範囲があり、基準点がセット済みなら、ドラッグで移動
      if (lassoMode === 'copying' && lassoSelections.length > 0 && lassoDragStart) {
        setIsLassoing(true);
        return;
      }
      // 移動中で選択範囲があり、基準点が未セットなら、クリック位置を基準点にしてドラッグ開始
      if (lassoMode === 'moving' && lassoSelections.length > 0 && !lassoDragStart) {
        setLassoDragStart(coords);
        setLassoDragOffset({ x: 0, y: 0 });
        setIsLassoing(true);
        return;
      }
      // 移動中で選択範囲があり、基準点がセット済みなら、ドラッグで移動
      if (lassoMode === 'moving' && lassoSelections.length > 0 && lassoDragStart) {
        setIsLassoing(true);
        return;
      }
      // 通常の投げ縄範囲追加はidle時のみ許可
      if (lassoMode === 'idle') {
        setIsLassoing(true);
        isLassoingRef.current = true;
        currentLassoRef.current = [{ x: coords.x, y: coords.y }];
        lastLassoPointRef.current = { x: coords.x, y: coords.y };
        window.addEventListener('mousemove', handleLassoMouseMove);
        window.addEventListener('mouseup', handleLassoMouseUp);
        window.requestAnimationFrame(drawCanvas);
      }
      return;
    }

    // --- ここから下は投げ縄以外のツールのみ ---

    // 全体移動ツール
    if (editorState.tool === 'move') {
      if (!isMovingCanvas) {
        setIsMovingCanvas(true);
        setMoveStart({ x: coords.x, y: coords.y });
        setMoveOffset({ x: 0, y: 0 });
      } else {
        // 2回目クリックで確定
        if (moveOffset.x !== 0 || moveOffset.y !== 0) {
          const h = editorState.layers[editorState.currentLayer].canvas.length;
          const w = editorState.layers[editorState.currentLayer].canvas[0]?.length || 0;
          const newCanvas = Array.from({ length: h }, (_, y) =>
            Array.from({ length: w }, (_, x) => {
              const srcX = x - moveOffset.x;
              const srcY = y - moveOffset.y;
              if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
                return editorState.layers[editorState.currentLayer].canvas[srcY][srcX];
              } else {
                return 0; // はみ出し部分は透明
              }
            })
          );
          // 選択中レイヤーのcanvasのみを更新
          const newLayers = editorState.layers.map((l, i) =>
            i === editorState.currentLayer ? { ...l, canvas: newCanvas } : l
          );
          onStateChange({ layers: newLayers });
        }
        setIsMovingCanvas(false);
        setMoveStart(null);
        setMoveOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (editorState.tool === 'line') {
      if (!lineStart) {
        setLineStart(coords); // 1回目クリックで始点セット
        setLinePreview(null);
      } else {
        let endCoords = coords;
        if (isShiftPressed) {
          endCoords = getSnappedLineEnd(lineStart, coords);
        }
        const points = getLinePoints(lineStart, endCoords);
        for (const point of points) {
          drawPixelDirect(point.x, point.y);
        }
        setLineStart(null); // リセット
        setLinePreview(null);
        // React状態に反映
        const newLayers = editorState.layers.map((l, i) =>
          i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
        );
        onStateChange({ layers: newLayers });
      }
      return;
    }

    if (editorState.tool === 'eyedropper') {
      // スポイト: クリックした位置の色を取得
      const colorIndex = canvasDataRef.current[coords.y][coords.x];
      onStateChange({ currentColor: colorIndex });
      return;
    }

    setIsDrawing(true);
    dragStartRef.current = coords;

    if (editorState.tool === 'fill') {
      // 塗りつぶし
      const newCanvas = floodFill(canvasDataRef.current, coords.x, coords.y, editorState.currentColor);
      // 選択中レイヤーのcanvasのみを更新
      const newLayers = editorState.layers.map((l, i) =>
        i === editorState.currentLayer ? { ...l, canvas: newCanvas } : l
      );
      onStateChange({ layers: newLayers });
      setIsDrawing(false);
      dragStartRef.current = null;
      return;
    }

    if (editorState.tool === 'eraser') {
      drawPixelDirect(coords.x, coords.y, true);
      // 即時反映
      const newLayers = editorState.layers.map((l, i) =>
        i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
      );
      onStateChange({ layers: newLayers });
      return;
    }

    // 四角ツール
    if (editorState.tool === 'rect') {
      if (!rectStart) {
        setRectStart(coords); // 1回目クリックで始点セット
        setRectPreview(null);
      } else {
        let endCoords = coords;
        if (isShiftPressed) {
          endCoords = getSnappedRectEnd(rectStart, coords);
        }
        const x1 = Math.min(rectStart.x, endCoords.x);
        const x2 = Math.max(rectStart.x, endCoords.x);
        const y1 = Math.min(rectStart.y, endCoords.y);
        const y2 = Math.max(rectStart.y, endCoords.y);
        for (let x = x1; x <= x2; x++) {
          drawPixelDirect(x, y1);
          drawPixelDirect(x, y2);
        }
        for (let y = y1 + 1; y < y2; y++) {
          drawPixelDirect(x1, y);
          drawPixelDirect(x2, y);
        }
        setRectStart(null);
        setRectPreview(null);
        // React状態に反映
        const newLayers = editorState.layers.map((l, i) =>
          i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
        );
        onStateChange({ layers: newLayers });
      }
      return;
    }

    // 円形ツール
    if (editorState.tool === 'ellipse') {
      if (!ellipseStart) {
        setEllipseStart(coords); // 1回目クリックで始点セット
        setEllipsePreview(null);
      } else {
        let endCoords = coords;
        if (isShiftPressed) {
          endCoords = getSnappedEllipseEnd(ellipseStart, coords);
        }
        // 2回目クリックで楕円描画
        drawEllipseOnCanvas(ellipseStart, endCoords);
        setEllipseStart(null);
        setEllipsePreview(null);
        // React状態に反映
        const newLayers = editorState.layers.map((l, i) =>
          i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
        );
        onStateChange({ layers: newLayers });
      }
      return;
    }

    // brush
    drawPixelDirect(coords.x, coords.y);
    // 即時反映
    const newLayers = editorState.layers.map((l, i) =>
      i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
    );
    onStateChange({ layers: newLayers });
  };

  // 線分をBresenham風に取得
  const getLinePoints = (start: { x: number, y: number }, end: { x: number, y: number }) => {
    const points: { x: number, y: number }[] = [];
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const sx = start.x < end.x ? 1 : -1;
    const sy = start.y < end.y ? 1 : -1;
    let err = dx - dy;
    let x = start.x;
    let y = start.y;
    while (true) {
      points.push({ x, y });
      if (x === end.x && y === end.y) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return points;
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (isPanning) return; // パン中は描画操作を無効化
    // コピー中でドラッグ中は、マウス位置に追従してプレビュー
    if (editorState.tool === 'lasso' && lassoMode === 'copying' && lassoSelections.length > 0 && lassoDragStart && isLassoing) {
      const coords = getPixelCoordinates(event);
      if (!coords) return;
      setLassoDragOffset({ x: coords.x - lassoDragStart.x, y: coords.y - lassoDragStart.y });
      window.requestAnimationFrame(drawCanvas);
      return;
    }
    if (editorState.tool === 'lasso' && lassoMode === 'moving' && lassoSelections.length > 0 && lassoDragStart && isLassoing) {
      const coords = getPixelCoordinates(event);
      if (!coords) return;
      setLassoDragOffset({ x: coords.x - lassoDragStart.x, y: coords.y - lassoDragStart.y });
      window.requestAnimationFrame(drawCanvas);
      return;
    }
    if (editorState.tool === 'line' && lineStart) {
      const coords = getPixelCoordinates(event);
      if (coords) {
        let previewCoords = coords;
        if (isShiftPressed) {
          previewCoords = getSnappedLineEnd(lineStart, coords);
        }
        setLinePreview(previewCoords);
      }
      return;
    }
    if (editorState.tool === 'rect' && rectStart) {
      const coords = getPixelCoordinates(event);
      if (coords) {
        let previewCoords = coords;
        if (isShiftPressed) {
          previewCoords = getSnappedRectEnd(rectStart, coords);
        }
        setRectPreview(previewCoords);
      }
      return;
    }
    if (editorState.tool === 'ellipse' && ellipseStart) {
      const coords = getPixelCoordinates(event);
      if (coords) {
        let previewCoords = coords;
        if (isShiftPressed) {
          previewCoords = getSnappedEllipseEnd(ellipseStart, coords);
        }
        setEllipsePreview(previewCoords);
      }
      return;
    }
    if (editorState.tool === 'move' && isMovingCanvas && moveStart) {
      const coords = getPixelCoordinates(event);
      if (!coords) return;
      setMoveOffset({ x: coords.x - moveStart.x, y: coords.y - moveStart.y });
      return;
    }
    if (!isDrawing) return;
    if (editorState.tool === 'fill' || editorState.tool === 'eyedropper') return;

    const coords = getPixelCoordinates(event);
    if (coords && onCursorMove) onCursorMove(coords);
    if (!coords || !dragStartRef.current) return;

    const points = getLinePoints(dragStartRef.current, coords);
    for (const point of points) {
      if (editorState.tool === 'eraser') {
        drawPixelDirect(point.x, point.y, true);
      } else {
        drawPixelDirect(point.x, point.y);
      }
    }
    dragStartRef.current = coords;

    // ローカルのcanvasを即時再描画
    drawCanvas();
    // --- ここでonStateChangeは呼ばない（マウスアップ時のみ同期）---
  };
  const originalHandleMouseDown = handleMouseDown;
  const handleMouseDownWithFlag = (event: React.MouseEvent) => {
    if (isPanning) return;
    isDrawingRef.current = true;
    originalHandleMouseDown(event);
  };

  // --- コピー確定処理 ---
  const confirmLassoCopy = () => {
    if (lassoMode === 'copying' && lassoSelections.length > 0) {
      const offset = { ...lassoDragOffset };
      const newLayers = editorState.layers.map((l, i) => {
        if (i !== editorState.currentLayer) return l;
        const canvas = l.canvas.map(row => [...row]);
        // コピー: 新しい位置に色を上書き
        for (const region of lassoSelections) {
          for (const { x, y } of region) {
            const nx = x + offset.x;
            const ny = y + offset.y;
            if (nx >= 0 && nx < canvas[0].length && ny >= 0 && ny < canvas.length) {
              canvas[ny][nx] = l.canvas[y][x];
            }
          }
        }
        return { ...l, canvas };
      });
      onStateChange({ layers: newLayers });
      // 選択範囲を新しい位置だけに更新（元の位置は消さない）
      const newSelections = lassoSelections.map(region => region.map(({ x, y }) => ({ x: x + offset.x, y: y + offset.y })));
      setLassoSelections(newSelections);
      currentLassoRef.current = [];
      setLassoMode('idle');
      setLassoDragStart(null);
      setLassoDragOffset({ x: 0, y: 0 });
    }
  };

  // --- 移動確定処理 ---
  const confirmLassoMove = () => {
    if (lassoMode === 'moving' && lassoSelections.length > 0) {
      const offset = { ...lassoDragOffset };
      const newLayers = editorState.layers.map((l, i) => {
        if (i !== editorState.currentLayer) return l;
        const canvas = l.canvas.map(row => [...row]);
        // 1. 先に元の位置を消す
        for (const region of lassoSelections) {
          for (const { x, y } of region) {
            if (x >= 0 && x < canvas[0].length && y >= 0 && y < canvas.length) {
              canvas[y][x] = 0;
            }
          }
        }
        // 2. 新しい位置に色を上書き
        for (const region of lassoSelections) {
          for (const { x, y } of region) {
            const nx = x + offset.x;
            const ny = y + offset.y;
            if (nx >= 0 && nx < canvas[0].length && ny >= 0 && ny < canvas.length) {
              canvas[ny][nx] = l.canvas[y][x];
            }
          }
        }
        return { ...l, canvas };
      });
      onStateChange({ layers: newLayers });
      // 選択範囲を新しい位置だけに更新
      const newSelections = lassoSelections.map(region => region.map(({ x, y }) => ({ x: x + offset.x, y: y + offset.y })));
      setLassoSelections(newSelections);
      currentLassoRef.current = [];
      setLassoMode('idle');
      setLassoDragStart(null);
      setLassoDragOffset({ x: 0, y: 0 });
    }
  };

  // handleMouseUp: 確定操作
  const handleMouseUp = () => {
    if (isPanning) return;
    isDrawingRef.current = false;
    if (onCursorMove) onCursorMove(null);
    setIsLassoing(false);
    isLassoingRef.current = false;
    lastLassoPointRef.current = null;
    window.removeEventListener('mousemove', handleLassoMouseMove);
    window.removeEventListener('mouseup', handleLassoMouseUp);
    setIsDrawing(false);
    dragStartRef.current = null;
    // React状態に反映
    // すべてのレイヤーを新しい参照で返す
    const newLayers = editorState.layers.map((l, i) =>
      i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : { ...l, canvas: l.canvas.map(row => [...row]) }
    );
    onStateChange({ layers: newLayers }); // ここでのみ同期
    saveToHistory();
    // コピー確定はEnter/ダブルクリックのみ
  };

  // パン開始
  const handlePanMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) { // ミドルボタン
      event.preventDefault();
      isDrawingRef.current = false;
      setIsPanning(true);
      setPanStart({ x: event.clientX - panOffset.x, y: event.clientY - panOffset.y });
    }
  };

  // パン中
  const handlePanMouseMove = (event: React.MouseEvent) => {
    if (isPanning && panStart) {
      setPanOffset({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
    }
  };

  // パン終了
  const handlePanMouseUp = () => {
    setIsPanning(false);
    setPanStart(null);
  };

  // 楕円描画アルゴリズム
  const drawEllipseOnCanvas = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const x1 = Math.min(start.x, end.x);
    const x2 = Math.max(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const y2 = Math.max(start.y, end.y);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = (x2 - x1) / 2;
    const ry = (y2 - y1) / 2;
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        // 枠線のみ描画
        const dx = (x - cx) / (rx || 1);
        const dy = (y - cy) / (ry || 1);
        const dist = dx * dx + dy * dy;
        if (Math.abs(dist - 1) < 0.08) {
          drawPixelDirect(x, y);
        }
      }
    }
  };

  // ダブルクリックでコピー/移動確定
  const handleDoubleClick = () => {
    if (lassoMode === 'copying') confirmLassoCopy();
    if (lassoMode === 'moving') confirmLassoMove();
  };

  // Enterキーでコピー/移動確定
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && lassoMode === 'copying' && lassoSelections.length > 0) {
        confirmLassoCopy();
      }
      if (e.key === 'Enter' && lassoMode === 'moving' && lassoSelections.length > 0) {
        confirmLassoMove();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lassoMode, lassoSelections, lassoDragOffset, editorState.layers, editorState.currentLayer]);

  // 1. handleWheel関数を追加
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    let newZoom = editorState.zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(editorState.zoom * 1.1, 8); // 最大8倍
    } else {
      newZoom = Math.max(editorState.zoom / 1.1, 0.1); // 最小0.1倍
    }
    onStateChange({ zoom: newZoom });
  };

  return (
    <div
      className="flex items-center justify-center p-0 bg-transparent border-none select-none"
      onMouseMove={handlePanMouseMove}
      onMouseUp={handlePanMouseUp}
      onMouseLeave={handlePanMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isPanning ? 'grab' : (editorState.tool === 'line' && lineStart) || (editorState.tool === 'rect' && rectStart) || (editorState.tool === 'ellipse' && ellipseStart) ? 'crosshair' : editorState.tool === 'move' ? 'move' : undefined }}
    >
      <div
        className="relative"
        style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)`, transition: isPanning ? 'none' : 'transform 0.1s' }}
        onMouseDown={handlePanMouseDown}
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="border border-gray-300 rounded shadow-sm cursor-crosshair bg-white"
          onMouseDown={isPanning ? undefined : handleMouseDownWithFlag}
          onMouseMove={isPanning ? undefined : handleMouseMove}
          onMouseUp={isPanning ? undefined : handleMouseUp}
          onMouseLeave={isPanning ? undefined : () => { setIsLassoing(false); isLassoingRef.current = false; lastLassoPointRef.current = null; handleMouseUp(); }}
          onDoubleClick={handleDoubleClick}
        />
        {/* Remote cursors */}
        {Array.isArray(remoteCursors) && remoteCursors.length > 0 && (
          <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
            style={{ zIndex: 40 }}
          >
            {remoteCursors.map((c, idx) => (
              <g key={idx}>
                <rect
                  x={c.x * pixelSize}
                  y={c.y * pixelSize}
                  width={pixelSize}
                  height={pixelSize}
                  fill={c.color || 'rgba(0,163,255,0.25)'}
                  stroke={c.color || '#00A3FF'}
                  strokeWidth={Math.max(1, pixelSize * 0.06)}
                />
              </g>
            ))}
          </svg>
        )}
        {/* --- キャンバス外側の目印（メモリ） --- */}
        <svg
          className="absolute left-0 top-0 pointer-events-none"
          width={canvasWidth}
          height={canvasHeight}
          style={{ zIndex: 30, left: 0, top: 0 }}
        >
          {(() => {
            const marks: JSX.Element[] = [];
            const markLen = Math.max(6, pixelSize * 0.5); // メモリの長さ
            const positions = [0.25, 0.5, 0.75]; // 四等分と中央
            // 上辺
            positions.forEach(p => {
              const x = canvasWidth * p;
              marks.push(<line key={`top-${p}`} x1={x} y1={0} x2={x} y2={markLen} stroke="#2196f3" strokeWidth={2} />);
            });
            // 下辺
            positions.forEach(p => {
              const x = canvasWidth * p;
              marks.push(<line key={`bottom-${p}`} x1={x} y1={canvasHeight} x2={x} y2={canvasHeight - markLen} stroke="#2196f3" strokeWidth={2} />);
            });
            // 左辺
            positions.forEach(p => {
              const y = canvasHeight * p;
              marks.push(<line key={`left-${p}`} x1={0} y1={y} x2={markLen} y2={y} stroke="#2196f3" strokeWidth={2} />);
            });
            // 右辺
            positions.forEach(p => {
              const y = canvasHeight * p;
              marks.push(<line key={`right-${p}`} x1={canvasWidth} y1={y} x2={canvasWidth - markLen} y2={y} stroke="#2196f3" strokeWidth={2} />);
            });
            return marks;
          })()}
        </svg>
        {/* 全体移動ツールのプレビュー（移動中は半透明で表示） */}
        {editorState.tool === 'move' && isMovingCanvas && (moveOffset.x !== 0 || moveOffset.y !== 0) && (
          <canvas
            width={canvasWidth}
            height={canvasHeight}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: 0.5, zIndex: 20 }}
            ref={el => {
              if (!el) return;
              const ctx = el.getContext('2d');
              if (!ctx) return;
              ctx.clearRect(0, 0, canvasWidth, canvasHeight);
              const h = editorState.layers[editorState.currentLayer].canvas.length;
              const w = editorState.layers[editorState.currentLayer].canvas[0]?.length || 0;
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  const srcX = x - moveOffset.x;
                  const srcY = y - moveOffset.y;
                  if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
                    const colorIndex = editorState.layers[editorState.currentLayer].canvas[srcY][srcX];
                    if (colorIndex > 0) {
                      ctx.fillStyle = editorState.palette[colorIndex - 1];
                      ctx.fillRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
                    }
                  }
                }
              }
            }}
          />
        )}
        {/* 直線ツールのプレビュー */}
        {editorState.tool === 'line' && lineStart && linePreview && (
          <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
            style={{ zIndex: 10 }}
          >
            <line
              x1={(lineStart.x + 0.5) * pixelSize}
              y1={(lineStart.y + 0.5) * pixelSize}
              x2={(linePreview.x + 0.5) * pixelSize}
              y2={(linePreview.y + 0.5) * pixelSize}
              stroke={editorState.palette[editorState.currentColor - 1] || '#000'}
              strokeWidth={Math.max(2, pixelSize * 0.2)}
              strokeDasharray="2,2"
            />
          </svg>
        )}
        {/* 四角ツールのプレビュー */}
        {editorState.tool === 'rect' && rectStart && rectPreview && (
          <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
            style={{ zIndex: 10 }}
          >
            <rect
              x={Math.min(rectStart.x, rectPreview.x) * pixelSize}
              y={Math.min(rectStart.y, rectPreview.y) * pixelSize}
              width={(Math.abs(rectStart.x - rectPreview.x) + 1) * pixelSize}
              height={(Math.abs(rectStart.y - rectPreview.y) + 1) * pixelSize}
              fill="none"
              stroke={editorState.palette[editorState.currentColor - 1] || '#000'}
              strokeWidth={Math.max(2, pixelSize * 0.2)}
              strokeDasharray="2,2"
            />
          </svg>
        )}
        {/* 円形ツールのプレビュー */}
        {editorState.tool === 'ellipse' && ellipseStart && ellipsePreview && (
          <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
            style={{ zIndex: 10 }}
          >
            <ellipse
              cx={((ellipseStart.x + ellipsePreview.x) / 2 + 0.5) * pixelSize}
              cy={((ellipseStart.y + ellipsePreview.y) / 2 + 0.5) * pixelSize}
              rx={Math.abs(ellipseStart.x - ellipsePreview.x + 1) * pixelSize / 2}
              ry={Math.abs(ellipseStart.y - ellipsePreview.y + 1) * pixelSize / 2}
              fill="none"
              stroke={editorState.palette[editorState.currentColor - 1] || '#000'}
              strokeWidth={Math.max(2, pixelSize * 0.2)}
              strokeDasharray="2,2"
            />
          </svg>
        )}
        <div className="absolute -top-6 left-0 text-xs text-gray-500">
          {width} × {height} pixels
        </div>
      </div>
    </div>
  );
};