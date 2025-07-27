import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PixelArtService } from "../services/pixelArtService";
import { FirebasePixelArt } from "../types";
import { Clipboard } from 'lucide-react';

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
  const [copyMsg, setCopyMsg] = useState('');

  // 履歴のローカルストレージ管理
  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      setHistory(JSON.parse(raw));
    }
  }, []);

  const saveHistory = (newHistory: RoomHistory[]) => {
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  };

  const handleEdit = (artworkId: string) => {
    navigate(`/editor/${artworkId}`);
  };

  const handleCopy = (artworkId: string) => {
    navigator.clipboard.writeText(artworkId);
    setCopyMsg('コピーしました');
    setTimeout(() => setCopyMsg(''), 1500);
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
              <td className="py-2 px-4 border font-mono">{h.artworkId}</td>
              <td className="py-2 px-4 border">{h.lastEdited}</td>
              <td className="py-2 px-4 border flex gap-2 items-center">
                <button className="px-2 py-1 bg-blue-500 text-white rounded text-xs" onClick={() => handleEdit(h.artworkId)}>編集</button>
                <button className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs flex items-center" onClick={() => handleCopy(h.artworkId)}>
                  <Clipboard className="w-4 h-4 mr-1" />コピー
                </button>
                <button className="px-2 py-1 bg-red-500 text-white rounded text-xs" onClick={() => handleDelete(h.artworkId)}>削除</button>
                {copyMsg && <span className="text-green-600 text-xs ml-2">{copyMsg}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MyGallery; 