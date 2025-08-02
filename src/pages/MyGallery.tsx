import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PixelArtService } from "../services/pixelArtService";
import { FirebasePixelArt } from "../types";
import { Clipboard } from 'lucide-react';
import { FirebaseGallery } from '../components/Gallery/FirebaseGallery';

interface RoomHistory {
  artworkId: string;
  title: string;
  lastEdited: string;
}

const HISTORY_KEY = 'dotart_room_history';

const MyGallery: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [history, setHistory] = useState<RoomHistory[]>([]);
  const [serialInput, setSerialInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [postedArtworks, setPostedArtworks] = useState<FirebasePixelArt[]>([]);
  const [loadingPosted, setLoadingPosted] = useState(false);

  // 履歴のローカルストレージ管理
  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      setHistory(JSON.parse(raw));
    }
  }, []);

  // 投稿作品の取得
  useEffect(() => {
    const fetchPostedArtworks = async () => {
      setLoadingPosted(true);
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const historyList: RoomHistory[] = raw ? JSON.parse(raw) : [];
        const roomIds = historyList.map(h => h.artworkId).filter(Boolean);
        if (roomIds.length === 0) {
          setPostedArtworks([]);
          setLoadingPosted(false);
          return;
        }
        // Firestoreから全公開作品を取得し、roomIdが一致するものだけ抽出
        const allArtworks = await PixelArtService.getPublicArtworks(100);
        const filtered = allArtworks.filter(a => a.roomId && roomIds.includes(a.roomId));
        // 新しい順
        filtered.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return bTime.getTime() - aTime.getTime();
        });
        setPostedArtworks(filtered);
      } catch (e) {
        setPostedArtworks([]);
      } finally {
        setLoadingPosted(false);
      }
    };
    fetchPostedArtworks();
  }, [history]);

  const saveHistory = (newHistory: RoomHistory[]) => {
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  };

  const handleEdit = (artworkId: string) => {
    navigate(`/editor/${artworkId}`);
  };

  const handleCopy = (artworkId: string) => {
    navigator.clipboard.writeText(artworkId);
    setCopiedId(artworkId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (artworkId: string) => {
    if (!window.confirm('履歴から削除しますか？')) return;
    const newHistory = history.filter(h => h.artworkId !== artworkId);
    saveHistory(newHistory);
  };

  const handleJoin = () => {
    if (!serialInput.trim()) return;
    navigate(`/editor/${serialInput.trim()}`);
  };

  if (!isAuthenticated) {
    return <div className="p-8">ログインしてください。</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">マイギャラリー</h1>
      <div className="flex items-center gap-2 mb-8">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="シリアルコードを入力"
          value={serialInput}
          onChange={e => setSerialInput(e.target.value)}
        />
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={handleJoin}
        >
          参加
        </button>
      </div>
      {/* 投稿された作品欄 */}
      <h2 className="text-lg font-semibold mb-2">投稿された作品</h2>
      {loadingPosted ? (
        <div className="py-8 text-center text-gray-400">読み込み中...</div>
      ) : postedArtworks.length === 0 ? (
        <div className="py-8 text-center text-gray-400">投稿作品はありません</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {postedArtworks.map(a => (
            <div key={a.id} className="bg-white rounded-lg shadow border p-4 flex flex-col items-center">
              <img src={a.imageUrl} alt={a.title} className="w-32 h-32 object-contain mb-2" />
              <div className="font-bold text-base mb-1">{a.title}</div>
              <div className="text-xs text-gray-500 mb-1">{a.roomTitle || '(ルーム無題)'}</div>
              <div className="text-xs text-gray-500 mb-1">by {a.authorNickname || a.authorName || 'ゲスト'}</div>
              <div className="text-xs text-gray-700 mb-2">{a.description}</div>
              <div className="text-xs text-gray-400">{a.createdAt?.toDate?.().toLocaleString?.() || ''}</div>
            </div>
          ))}
        </div>
      )}
      {/* 履歴欄 */}
      <h2 className="text-lg font-semibold mb-2">履歴</h2>
      <table className="w-full border mt-2">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-4 border">タイトル</th>
            <th className="py-2 px-4 border">シリアルコード</th>
            <th className="py-2 px-4 border">最終編集</th>
            <th className="py-2 px-4 border">操作</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 && (
            <tr><td colSpan={4} className="text-center py-6 text-gray-400">履歴はありません</td></tr>
          )}
          {history.map(h => (
            <tr key={h.artworkId} className="border-b">
              <td className="py-2 px-4 border">{h.title || '(無題)'}</td>
              <td className="py-2 px-4 border font-mono flex items-center gap-2">
                {h.artworkId}
                <button
                  className="ml-1 p-1 bg-gray-100 rounded hover:bg-gray-200"
                  title="コピー"
                  onClick={() => handleCopy(h.artworkId)}
                >
                  <Clipboard className="w-4 h-4" />
                </button>
                {copiedId === h.artworkId && <span className="text-green-600 text-xs ml-2">コピーしました</span>}
              </td>
              <td className="py-2 px-4 border">{h.lastEdited}</td>
              <td className="py-2 px-4 border flex gap-2 items-center">
                <button className="px-2 py-1 bg-blue-500 text-white rounded text-xs" onClick={() => handleEdit(h.artworkId)}>編集</button>
                <button className="px-2 py-1 bg-red-500 text-white rounded text-xs" onClick={() => handleDelete(h.artworkId)}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MyGallery; 