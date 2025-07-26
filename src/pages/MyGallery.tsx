import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PixelArtService } from "../services/pixelArtService";
import { FirebasePixelArt } from "../types";

const MyGallery: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [drafts, setDrafts] = useState<FirebasePixelArt[]>([]);
  const [artworks, setArtworks] = useState<FirebasePixelArt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      PixelArtService.getUserDrafts(user.id),
      PixelArtService.getUserArtworks(user.id)
    ]).then(([drafts, arts]) => {
      setDrafts(drafts);
      setArtworks(arts.filter(a => !a.isDraft));
      setLoading(false);
    });
  }, [user]);

  const handleNew = () => {
    navigate("/editor");
  };

  const handleEdit = (id: string) => {
    navigate(`/editor/${id}`);
  };

  const handleDelete = async (id: string, isDraft: boolean) => {
    if (!window.confirm('本当に削除しますか？この操作は取り消せません。')) return;
    try {
      await PixelArtService.deleteArtwork(id);
      if (isDraft) {
        setDrafts(prev => prev.filter(art => art.id !== id));
      } else {
        setArtworks(prev => prev.filter(art => art.id !== id));
      }
    } catch (e) {
      alert('削除に失敗しました');
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev =>
      checked ? [...prev, id] : prev.filter(i => i !== id)
    );
  };

  const handleSelectAll = (items: FirebasePixelArt[], checked: boolean) => {
    if (checked) {
      setSelectedIds(Array.from(new Set([...selectedIds, ...items.map(i => i.id!)])));
    } else {
      setSelectedIds(prev => prev.filter(id => !items.some(i => i.id === id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`${selectedIds.length}件削除しますか？この操作は取り消せません。`)) return;
    try {
      await Promise.all(selectedIds.map(id => PixelArtService.deleteArtwork(id)));
      setDrafts(prev => prev.filter(art => !selectedIds.includes(art.id!)));
      setArtworks(prev => prev.filter(art => !selectedIds.includes(art.id!)));
      setSelectedIds([]);
    } catch (e) {
      alert('一括削除に失敗しました');
    }
  };

  if (!isAuthenticated) {
    return <div className="p-8">ログインしてください。</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">マイギャラリー</h1>
      <button
        className="mb-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        onClick={handleNew}
      >
        新規作成
      </button>
      {loading ? (
        <div>読み込み中...</div>
      ) : (
        <>
          <h2 className="text-lg font-semibold mt-4 mb-2">下書き</h2>
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="flex items-center gap-4 mb-2">
              <input
                type="checkbox"
                checked={drafts.length > 0 && drafts.every(art => selectedIds.includes(art.id!))}
                onChange={e => handleSelectAll(drafts, e.target.checked)}
              />
              <span>下書きを全選択</span>
              <button
                className="ml-2 px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
              >
                選択した作品を削除
              </button>
            </div>
            {drafts.length === 0 && <div>下書きはありません。</div>}
            {drafts.map((art) => (
              <div
                key={art.id}
                className="p-4 border rounded cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                onClick={() => handleEdit(art.id!)}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(art.id!)}
                    onChange={e => { e.stopPropagation(); handleSelect(art.id!, e.target.checked); }}
                    onClick={e => e.stopPropagation()}
                  />
                  <img
                    src={art.imageUrl || 'https://via.placeholder.com/48x48?text=No+Image'}
                    alt={art.title}
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <span>{art.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600 ml-2">下書き</span>
                  <button
                    className="ml-2 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                    onClick={e => { e.stopPropagation(); handleDelete(art.id!, true); }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
          <h2 className="text-lg font-semibold mb-2">投稿済み作品</h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-4 mb-2">
              <input
                type="checkbox"
                checked={artworks.length > 0 && artworks.every(art => selectedIds.includes(art.id!))}
                onChange={e => handleSelectAll(artworks, e.target.checked)}
              />
              <span>投稿済み作品を全選択</span>
              <button
                className="ml-2 px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
              >
                選択した作品を削除
              </button>
            </div>
            {artworks.length === 0 && <div>投稿済み作品はありません。</div>}
            {artworks.map((art) => (
              <div
                key={art.id}
                className="p-4 border rounded cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                onClick={() => handleEdit(art.id!)}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(art.id!)}
                    onChange={e => { e.stopPropagation(); handleSelect(art.id!, e.target.checked); }}
                    onClick={e => e.stopPropagation()}
                  />
                  <img
                    src={art.imageUrl || 'https://via.placeholder.com/48x48?text=No+Image'}
                    alt={art.title}
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <span>{art.title}</span>
                </div>
                <button
                  className="ml-2 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                  onClick={e => { e.stopPropagation(); handleDelete(art.id!, false); }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MyGallery; 