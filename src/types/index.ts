export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  createdAt: Date;
  nickname?: string;
}

export interface PixelArt {
  id: string;
  title: string;
  description?: string;
  author: User;
  imageData: string; // Base64 encoded image
  pixelData: number[][]; // 2D array of color indices
  width: number;
  height: number;
  palette: string[]; // Array of hex colors
  likes: number;
  downloads: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface Layer {
  id: string;
  name: string;
  canvas: number[][];
  opacity: number; // 0~1
  visible: boolean;
}

export interface EditorState {
  canvas: number[][];
  palette: string[];
  currentColor: number;
  tool: 'brush' | 'eraser' | 'eyedropper' | 'fill' | 'line' | 'rect' | 'ellipse' | 'move';
  zoom: number;
  history: Layer[][];
  historyIndex: number;
  layers: Layer[];
  currentLayer: number;
}

export interface FirebasePixelArt {
  id?: string;
  title: string;
  description?: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorNickname?: string;
  imageUrl: string;
  pixelData: number[][];
  width: number;
  height: number;
  palette: string[];
  likes: number;
  downloads: number;
  isPublic: boolean;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface ChatGPTIntegration {
  // Future ChatGPT integration types
  suggestion?: string;
  colorAdvice?: string[];
  ideaPrompt?: string;
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