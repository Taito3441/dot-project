export const createEmptyCanvas = (width: number, height: number): number[][] => {
  return Array(height).fill(null).map(() => Array(width).fill(0));
};

export const getDefaultPalette = (): string[] => {
  return [
    '#ffffff', '#f3f4f6', '#d1d5db', '#9ca3af', '#6b7280', '#374151', '#1f2937', '#000000',
    '#fef2f2', '#fecaca', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
    '#fff7ed', '#fed7aa', '#fdba74', '#fb923c', '#ea580c', '#dc2626', '#c2410c', '#9a3412',
    '#fefce8', '#fde68a', '#fcd34d', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f',
    '#f0fdf4', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534',
    '#f0f9ff', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985',
    '#faf5ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7c3aed', '#6d28d9',
    '#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#ec4899', '#db2777', '#be185d', '#9d174d',
  ];
};

export const canvasToImageData = (
  canvas: number[][],
  palette: string[],
  scale: number = 1
): string => {
  const canvasElement = document.createElement('canvas');
  const ctx = canvasElement.getContext('2d')!;
  
  const width = canvas[0]?.length || 0;
  const height = canvas.length;
  
  canvasElement.width = width * scale;
  canvasElement.height = height * scale;
  
  ctx.imageSmoothingEnabled = false;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorIndex = canvas[y][x];
      if (colorIndex > 0) {
        ctx.fillStyle = palette[colorIndex];
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  
  return canvasElement.toDataURL('image/png');
};

export const downloadCanvas = (
  canvas: number[][],
  palette: string[],
  filename: string = 'pixel-art.png',
  scale: number = 10
): void => {
  const imageData = canvasToImageData(canvas, palette, scale);
  const link = document.createElement('a');
  link.href = imageData;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const floodFill = (
  canvas: number[][],
  x: number,
  y: number,
  newColor: number
): number[][] => {
  const height = canvas.length;
  const width = canvas[0]?.length || 0;
  
  if (x < 0 || x >= width || y < 0 || y >= height) return canvas;
  
  const originalColor = canvas[y][x];
  if (originalColor === newColor) return canvas;
  
  const newCanvas = canvas.map(row => [...row]);
  const stack: [number, number][] = [[x, y]];
  
  while (stack.length > 0) {
    const [currentX, currentY] = stack.pop()!;
    
    if (
      currentX < 0 || currentX >= width ||
      currentY < 0 || currentY >= height ||
      newCanvas[currentY][currentX] !== originalColor
    ) {
      continue;
    }
    
    newCanvas[currentY][currentX] = newColor;
    
    stack.push([currentX + 1, currentY]);
    stack.push([currentX - 1, currentY]);
    stack.push([currentX, currentY + 1]);
    stack.push([currentX, currentY - 1]);
  }
  
  return newCanvas;
};