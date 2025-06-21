import React, { useRef, useEffect, useState } from 'react';
import { EditorState } from '../../types';
import { floodFill } from '../../utils/pixelArt';

interface CanvasProps {
  editorState: EditorState;
  onStateChange: (newState: Partial<EditorState>) => void;
  width: number;
  height: number;
}

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

  const pixelSize = Math.min(720 / Math.max(width, height) * editorState.zoom, 56);
  const canvasWidth = width * pixelSize;
  const canvasHeight = height * pixelSize;

  useEffect(() => {
    canvasDataRef.current = editorState.canvas.map(row => [...row]);
  }, [editorState.canvas]);

  useEffect(() => {
    drawCanvas();
  }, [editorState.canvas, editorState.palette, pixelSize]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw background grid
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    
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
    
    // Draw pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colorIndex = editorState.canvas[y][x];
        if (colorIndex > 0) {
          ctx.fillStyle = editorState.palette[colorIndex - 1];
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
    newHistory.push(editorState.canvas.map(row => [...row]));
    
    onStateChange({
      history: newHistory.slice(-50), // Keep last 50 states
      historyIndex: Math.min(newHistory.length - 1, 49),
    });
  };

  const drawPixelDirect = (x: number, y: number, erase = false) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (erase) {
      canvasDataRef.current[y][x] = 0;
      ctx.clearRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
      return;
    }
    const colorIndex = editorState.currentColor;
    canvasDataRef.current[y][x] = colorIndex;
    if (colorIndex > 0) {
      ctx.fillStyle = editorState.palette[colorIndex - 1];
      ctx.fillRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
    } else {
      // Eraser (透明)
      ctx.clearRect(x * pixelSize + 1, y * pixelSize + 1, pixelSize - 2, pixelSize - 2);
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1) return; // ホイールボタンはツール操作を一切無効化
    if (isPanning) return; // パン中は描画操作を無効化
    const coords = getPixelCoordinates(event);
    if (!coords) return;

    if (editorState.tool === 'line') {
      if (!lineStart) {
        setLineStart(coords); // 1回目クリックで始点セット
        setLinePreview(null);
      } else {
        saveToHistory();
        // 2回目クリックで直線描画
        const points = getLinePoints(lineStart, coords);
        for (const point of points) {
          drawPixelDirect(point.x, point.y);
        }
        setLineStart(null); // リセット
        setLinePreview(null);
        // React状態に反映
        onStateChange({ canvas: canvasDataRef.current.map(row => [...row]) });
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
      saveToHistory();
      // 塗りつぶし
      const newCanvas = floodFill(canvasDataRef.current, coords.x, coords.y, editorState.currentColor);
      onStateChange({ canvas: newCanvas });
      setIsDrawing(false);
      setDragStart(null);
      return;
    }

    if (editorState.tool === 'eraser') {
      saveToHistory();
      drawPixelDirect(coords.x, coords.y, true);
      return;
    }

    // 四角ツール
    if (editorState.tool === 'rect') {
      if (!rectStart) {
        setRectStart(coords); // 1回目クリックで始点セット
        setRectPreview(null);
      } else {
        saveToHistory();
        // 2回目クリックで四角形描画
        const x1 = Math.min(rectStart.x, coords.x);
        const x2 = Math.max(rectStart.x, coords.x);
        const y1 = Math.min(rectStart.y, coords.y);
        const y2 = Math.max(rectStart.y, coords.y);
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
        onStateChange({ canvas: canvasDataRef.current.map(row => [...row]) });
      }
      return;
    }

    // brush
    saveToHistory();
    drawPixelDirect(coords.x, coords.y);
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
      if (coords) setLinePreview(coords);
      return;
    }
    if (editorState.tool === 'rect' && rectStart) {
      const coords = getPixelCoordinates(event);
      if (coords) setRectPreview(coords);
      return;
    }
    if (!isDrawing) return;
    if (editorState.tool === 'fill' || editorState.tool === 'eyedropper') return;

    const coords = getPixelCoordinates(event);
    if (!coords || !dragStart) return;

    const points = getLinePoints(dragStart, coords);
    for (const point of points) {
      if (editorState.tool === 'eraser') {
        drawPixelDirect(point.x, point.y, true);
      } else {
        drawPixelDirect(point.x, point.y);
      }
    }

    setDragStart(coords);
  };

  const handleMouseUp = () => {
    if (isPanning) return; // パン中は描画操作を無効化
    setIsDrawing(false);
    setDragStart(null);
    // React状態に反映
    onStateChange({ canvas: canvasDataRef.current.map(row => [...row]) });
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

  return (
    <div
      className="flex items-center justify-center p-0 bg-transparent border-none select-none"
      onMouseMove={handlePanMouseMove}
      onMouseUp={handlePanMouseUp}
      onMouseLeave={handlePanMouseUp}
      style={{ cursor: isPanning ? 'grab' : (editorState.tool === 'line' && lineStart) || (editorState.tool === 'rect' && rectStart) ? 'crosshair' : undefined }}
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
              width={Math.abs(rectStart.x - rectPreview.x + 1) * pixelSize}
              height={Math.abs(rectStart.y - rectPreview.y + 1) * pixelSize}
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