import React, { useRef, useEffect, useState } from 'react';
import { EditorState } from '../../types';
import { floodFill } from '../../utils/pixelArt';

interface CanvasProps {
  editorState: EditorState;
  onStateChange: (newState: Partial<EditorState>) => void;
  width: number;
  height: number;
}

type Layer = {
  id: string;
  name: string;
  canvas: number[][];
  opacity: number; // 0~1
  visible: boolean;
};

export const Canvas: React.FC<CanvasProps> = ({
  editorState,
  onStateChange,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
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
  }, [editorState.canvas, editorState.palette, pixelSize, editorState.layers, editorState.currentLayer, editorState.showGrid, editorState.backgroundPattern]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw background grid (市松模様)
    const gridSize = Math.max(4, Math.floor(pixelSize / 3));
    const isDark = editorState.backgroundPattern === 'dark';
    const colorA = isDark ? '#222' : '#f3f4f6';
    const colorB = isDark ? '#444' : '#e5e7eb';
    for (let y = 0; y < canvasHeight; y += gridSize) {
      for (let x = 0; x < canvasWidth; x += gridSize) {
        ctx.fillStyle = ((x / gridSize + y / gridSize) % 2 === 0) ? colorA : colorB;
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }

    // Draw grid lines
    if (editorState.showGrid) {
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
          const colorIndex = layer.canvas[y][x];
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
  };

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
      canvas: layer.canvas.map(row => [...row]),
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

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) return; // ホイールボタンはツール操作を一切無効化
    if (isPanning) return; // パン中は描画操作を無効化
    const coords = getPixelCoordinates(event);
    if (!coords) return;

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
    setDragStart(coords);

    if (editorState.tool === 'fill') {
      // 塗りつぶし
      const newCanvas = floodFill(canvasDataRef.current, coords.x, coords.y, editorState.currentColor);
      // 選択中レイヤーのcanvasのみを更新
      const newLayers = editorState.layers.map((l, i) =>
        i === editorState.currentLayer ? { ...l, canvas: newCanvas } : l
      );
      onStateChange({ layers: newLayers });
      setIsDrawing(false);
      setDragStart(null);
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
        // 2回目クリックで楕円描画
        drawEllipseOnCanvas(ellipseStart, coords);
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
      if (coords) setEllipsePreview(coords);
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
    if (!coords || !dragStart) return;

    const points = getLinePoints(dragStart, coords);
    let painted = false;
    for (const point of points) {
      if (editorState.tool === 'eraser') {
        drawPixelDirect(point.x, point.y, true);
        painted = true;
      } else {
        drawPixelDirect(point.x, point.y);
        painted = true;
      }
    }
    if (painted) {
      // 即時反映: 選択中レイヤーのcanvasを更新
      const newLayers = editorState.layers.map((l, i) =>
        i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
      );
      onStateChange({ layers: newLayers });
    }
    setDragStart(coords);
  };

  const handleMouseUp = () => {
    if (isPanning) return; // パン中は描画操作を無効化
    // 全体移動ツールはここでは何もしない
    setIsDrawing(false);
    setDragStart(null);
    // React状態に反映
    const newLayers = editorState.layers.map((l, i) =>
      i === editorState.currentLayer ? { ...l, canvas: canvasDataRef.current.map(row => [...row]) } : l
    );
    onStateChange({ layers: newLayers });
    // ここで履歴を記録
    saveToHistory();
  };

  // パン開始
  const handlePanMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) { // ミドルボタン
      event.preventDefault();
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

  return (
    <div
      className="flex items-center justify-center p-0 bg-transparent border-none select-none"
      onMouseMove={handlePanMouseMove}
      onMouseUp={handlePanMouseUp}
      onMouseLeave={handlePanMouseUp}
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
          onMouseDown={isPanning ? undefined : handleMouseDown}
          onMouseMove={isPanning ? undefined : handleMouseMove}
          onMouseUp={isPanning ? undefined : handleMouseUp}
          onMouseLeave={isPanning ? undefined : handleMouseUp}
        />
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