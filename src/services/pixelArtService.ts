import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { FirebasePixelArt, User } from '../types';
import { canvasToImageData } from '../utils/pixelArt';

export class PixelArtService {
  private static COLLECTION_NAME = 'pixelArts';

  static async uploadPixelArt(
    title: string,
    description: string,
    canvas: number[][],
    palette: string[],
    user: User
  ): Promise<string> {
    try {
      // Generate image data
      const imageData = canvasToImageData(canvas, palette, 10);

      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();

      // Upload image to Firebase Storage
      const imageRef = ref(storage, `pixel-arts/${Date.now()}_${user.id}.png`);
      const uploadResult = await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(uploadResult.ref);

      // Flatten canvas for Firestore (1D配列に変換)
      const flattenedCanvas = canvas.flat();

      // Save artwork data to Firestore
      const artworkData: Omit<FirebasePixelArt, 'id'> = {
        title,
        description,
        authorId: user.id,
        authorName: user.username,
        authorEmail: user.email,
        authorNickname: user.nickname || 'ゲストさん',
        imageUrl,
        pixelData: flattenedCanvas, // ← Flattened
        width: canvas[0]?.length || 32,
        height: canvas.length,
        palette,
        likes: 0,
        downloads: 0,
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), artworkData);
      return docRef.id;
    } catch (error) {
      console.error('Error uploading pixel art:', error);
      throw error;
    }
  }

  static async getPublicArtworks(limitCount: number = 50): Promise<FirebasePixelArt[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('isPublic', '==', true),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const width = data.width || 32;
        const height = data.height || 32;

        return {
          id: doc.id,
          title: data.title,
          description: data.description,
          authorId: data.authorId,
          authorName: data.authorName,
          authorEmail: data.authorEmail,
          authorNickname: data.authorNickname || data.authorName || 'ゲストさん',
          imageUrl: data.imageUrl,
          pixelData: this.reshapeCanvas(data.pixelData, width, height),
          width,
          height,
          palette: data.palette,
          likes: data.likes,
          downloads: data.downloads,
          isPublic: data.isPublic,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as FirebasePixelArt;
      });
    } catch (error) {
      console.error('Error fetching artworks:', error);
      throw error;
    }
  }

  static async getUserArtworks(userId: string): Promise<FirebasePixelArt[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const width = data.width || 32;
        const height = data.height || 32;

        return {
          id: doc.id,
          title: data.title,
          description: data.description,
          authorId: data.authorId,
          authorName: data.authorName,
          authorEmail: data.authorEmail,
          authorNickname: data.authorNickname || data.authorName || 'ゲストさん',
          imageUrl: data.imageUrl,
          pixelData: this.reshapeCanvas(data.pixelData, width, height),
          width,
          height,
          palette: data.palette,
          likes: data.likes,
          downloads: data.downloads,
          isPublic: data.isPublic,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as FirebasePixelArt;
      });
    } catch (error) {
      console.error('Error fetching user artworks:', error);
      throw error;
    }
  }

  static async likeArtwork(artworkId: string): Promise<void> {
    try {
      const artworkRef = doc(db, this.COLLECTION_NAME, artworkId);
      await updateDoc(artworkRef, {
        likes: increment(1),
      });
    } catch (error) {
      console.error('Error liking artwork:', error);
      throw error;
    }
  }

  static async incrementDownload(artworkId: string): Promise<void> {
    try {
      const artworkRef = doc(db, this.COLLECTION_NAME, artworkId);
      await updateDoc(artworkRef, {
        downloads: increment(1),
      });
    } catch (error) {
      console.error('Error incrementing download:', error);
      throw error;
    }
  }

  static async deleteArtwork(artworkId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, this.COLLECTION_NAME, artworkId));
    } catch (error) {
      console.error('Error deleting artwork:', error);
      throw error;
    }
  }

  // ヘルパー：一次元配列 → 二次元配列へ復元
  private static reshapeCanvas(flat: any, width: number, height: number): number[][] {
    if (!flat || (Array.isArray(flat) && flat.length === 0)) return [];
    if (Array.isArray(flat) && Array.isArray(flat[0])) {
      // すでに二次元配列
      return flat as number[][];
    }
    const reshaped: number[][] = [];
    for (let i = 0; i < height; i++) {
      reshaped.push((flat as number[]).slice(i * width, (i + 1) * width));
    }
    return reshaped;
  }

  // 統計情報を取得
  static async getStats(): Promise<{
    artworkCount: number;
    artistCount: number;
    totalDownloads: number;
    totalLikes: number;
  }> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('isPublic', '==', true)
      );
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => doc.data());
      const artworkCount = docs.length;
      const artistSet = new Set<string>();
      let totalDownloads = 0;
      let totalLikes = 0;
      for (const doc of docs) {
        artistSet.add(doc.authorId);
        totalDownloads += doc.downloads || 0;
        totalLikes += doc.likes || 0;
      }
      return {
        artworkCount,
        artistCount: artistSet.size,
        totalDownloads,
        totalLikes,
      };
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }
}
