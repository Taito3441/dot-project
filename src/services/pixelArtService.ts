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
import { FirebasePixelArt, User, Layer, LayerFirestore } from '../types';
import { canvasToImageData } from '../utils/pixelArt';

// DataURL→Blob変換ユーティリティ
function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export class PixelArtService {
  private static COLLECTION_NAME = 'pixelArts';

  static async uploadPixelArt(
    title: string,
    description: string,
    canvas: number[][],
    palette: string[],
    user: User,
    isDraft: boolean = false,
    layers?: Layer[]
  ): Promise<string> {
    try {
      // Generate image data
      const imageData = canvasToImageData(canvas, palette, 10);

      // Convert base64 to blob (fetchを使わずdataURLtoBlobで変換)
      const blob = dataURLtoBlob(imageData);

      // Upload image to Firebase Storage
      const imageRef = ref(storage, `pixel-arts/${Date.now()}_${user.id}.png`);
      const uploadResult = await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(uploadResult.ref);

      // Firestoreに保存するlayersはcanvasを一次元配列に変換
      const safeLayers: LayerFirestore[] | undefined = layers
        ? layers.map(l => ({ ...l, canvas: l.canvas.flat() }))
        : undefined;

      // Save artwork data to Firestore
      const artworkData: Omit<FirebasePixelArt, 'id'> & { layers?: LayerFirestore[] } = {
        title,
        description,
        authorId: user.id,
        authorName: user.username,
        authorEmail: user.email,
        authorNickname: user.nickname || 'ゲストさん',
        imageUrl,
        pixelData: canvas.flat() as any, // Firestoreには一次元配列で保存
        width: canvas[0]?.length || 32,
        height: canvas.length,
        palette,
        likes: 0,
        downloads: 0,
        isPublic: !isDraft,
        isDraft,
        layers: safeLayers,
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
          isDraft: data.isDraft,
          layers: data.layers
            ? data.layers.map((l: any) => ({ ...l, canvas: this.reshapeCanvas(l.canvas, width, height) }))
            : [{ id: 'layer-1', name: 'レイヤー 1', canvas: this.reshapeCanvas(data.pixelData, width, height), opacity: 1, visible: true }],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as FirebasePixelArt;
      });
    } catch (error) {
      console.error('Error fetching user artworks:', error);
      throw error;
    }
  }

  static async likeArtwork(artworkId: string, userId: string): Promise<'liked' | 'unliked'> {
    try {
      const artworkRef = doc(db, this.COLLECTION_NAME, artworkId);
      const artworkSnap = await getDocs(query(collection(db, this.COLLECTION_NAME), where('__name__', '==', artworkId)));
      if (artworkSnap.empty) throw new Error('Artwork not found');
      const docData = artworkSnap.docs[0].data();
      const likedUserIds: string[] = docData.likedUserIds || [];
      let newLikedUserIds: string[];
      let incrementValue: number;
      let result: 'liked' | 'unliked';
      if (likedUserIds.includes(userId)) {
        // 既にいいね済み→取り消し
        newLikedUserIds = likedUserIds.filter(id => id !== userId);
        incrementValue = -1;
        result = 'unliked';
      } else {
        // まだいいねしていない→追加
        newLikedUserIds = [...likedUserIds, userId];
        incrementValue = 1;
        result = 'liked';
      }
      await updateDoc(artworkRef, {
        likes: increment(incrementValue),
        likedUserIds: newLikedUserIds,
      });
      return result;
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
  static reshapeCanvas(flat: any, width: number, height: number): number[][] {
    if (!flat || (Array.isArray(flat) && flat.length === 0)) return [];
    if (Array.isArray(flat) && Array.isArray(flat[0])) {
      // すでに二次元配列
      return flat as number[][];
    }
    // 一次元配列の場合のみ分割
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

  static async getUserDrafts(userId: string): Promise<FirebasePixelArt[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('authorId', '==', userId),
        where('isDraft', '==', true),
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
          isDraft: data.isDraft,
          layers: data.layers
            ? data.layers.map((l: any) => ({ ...l, canvas: this.reshapeCanvas(l.canvas, width, height) }))
            : [{ id: 'layer-1', name: 'レイヤー 1', canvas: this.reshapeCanvas(data.pixelData, width, height), opacity: 1, visible: true }],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as FirebasePixelArt;
      });
    } catch (error) {
      console.error('Error fetching user drafts:', error);
      throw error;
    }
  }

  static async updatePixelArt(
    artworkId: string,
    data: Partial<Omit<FirebasePixelArt, 'id' | 'createdAt' | 'authorId' | 'authorName' | 'authorEmail' | 'authorNickname'>> & { updatedAt?: any; isDraft?: boolean; isPublic?: boolean; layers?: any[] }
  ): Promise<void> {
    try {
      const artworkRef = doc(db, this.COLLECTION_NAME, artworkId);
      // Firestoreに保存するlayersはcanvasを一次元配列に変換（すでに一次元ならそのまま）
      let safeLayers: LayerFirestore[] | undefined = undefined;
      if (data.layers) {
        safeLayers = data.layers.map(l => ({
          ...l,
          canvas: Array.isArray(l.canvas)
            ? Array.isArray(l.canvas[0])
              ? Array.prototype.slice.call(l.canvas.flat())
              : Array.prototype.slice.call(l.canvas)
            : []
        }));
      }
      console.log('updatePixelArt safeLayers', safeLayers);
      // pixelDataもArray.fromで通常配列に変換（多次元配列ならflat）
      let safePixelData: any = data.pixelData;
      if (Array.isArray(safePixelData)) {
        if (Array.isArray(safePixelData[0])) {
          safePixelData = (safePixelData as any[]).flat();
        }
        safePixelData = Array.from(safePixelData as any);
      }
      // paletteもArray.fromで通常配列に変換
      let safePalette: any = data.palette;
      if (Array.isArray(safePalette)) {
        safePalette = Array.from(safePalette as any);
      }
      // layersがundefinedの場合はArray.fromを呼ばない
      if (safeLayers) {
        safeLayers = safeLayers.map(l => ({
          ...l,
          canvas: Array.isArray(l.canvas) ? Array.from(l.canvas as any) : l.canvas
        }));
      }
      const updateData: any = {
        ...data,
        pixelData: safePixelData,
        palette: safePalette,
        updatedAt: serverTimestamp(),
      };
      if (safeLayers) {
        updateData.layers = safeLayers;
      }
      console.log('updateDoc data', updateData);
      await updateDoc(artworkRef, updateData);
    } catch (error) {
      console.error('Error updating pixel art:', error);
      throw error;
    }
  }
}
