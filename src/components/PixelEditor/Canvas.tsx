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

  const pixelSize = Math.min(400 / Math.max(width, height) * editorState.zoom, 40);
  const canvasWidth = width * pixelSize;
  const canvasHeight = height * pixelSize;

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

  const drawPixel = (x: number, y: number) => {
    const newCanvas = editorState.canvas.map(row => [...row]);
    
    switch (editorState.tool) {
      case 'brush':
        newCanvas[y][x] = editorState.currentColor;
        break;
      case 'eraser':
        newCanvas[y][x] = 0;
        break;
      case 'eyedropper':
        const colorIndex = editorState.canvas[y][x];
        onStateChange({ currentColor: colorIndex });
        return;
      case 'fill':
        const filledCanvas = floodFill(editorState.canvas, x, y, editorState.currentColor);
        onStateChange({ canvas: filledCanvas });
        saveToHistory();
        return;
    }
    
    onStateChange({ canvas: newCanvas });
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    const coords = getPixelCoordinates(event);
    if (!coords) return;

    setIsDrawing(true);
    setDragStart(coords);
    
    if (editorState.tool !== 'fill') {
      saveToHistory();
    }
    
    drawPixel(coords.x, coords.y);
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
    if (!isDrawing || editorState.tool === 'fill' || editorState.tool === 'eyedropper') return;

    const coords = getPixelCoordinates(event);
    if (!coords || !dragStart) return;

    const points = getLinePoints(dragStart, coords);
    for (const point of points) {
      drawPixel(point.x, point.y);
    }

    setDragStart(coords); // 現在の位置を次回の始点にする
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setDragStart(null);
  };

  return (
    <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="border border-gray-300 rounded shadow-sm cursor-crosshair bg-white"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <div className="absolute -top-6 left-0 text-xs text-gray-500">
          {width} × {height} pixels
        </div>
      </div>
    </div>
  );
};