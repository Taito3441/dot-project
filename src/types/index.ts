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

export interface EditorState {
  canvas: number[][];
  palette: string[];
  currentColor: number;
  tool: 'brush' | 'eraser' | 'eyedropper' | 'fill';
  zoom: number;
  history: number[][][];
  historyIndex: number;
}

export interface FirebasePixelArt {
  id?: string;
  title: string;
  description?: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
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