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
            {drafts.length === 0 && <div>下書きはありません。</div>}
            {drafts.map((art) => (
              <div
                key={art.id}
                className="p-4 border rounded cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                onClick={() => handleEdit(art.id!)}
              >
                <div className="flex items-center gap-4">
                  <img
                    src={art.imageUrl || 'https://via.placeholder.com/48x48?text=No+Image'}
                    alt={art.title}
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <span>{art.title}</span>
                </div>
                <span className="text-xs text-yellow-600 ml-2">下書き</span>
              </div>
            ))}
          </div>
          <h2 className="text-lg font-semibold mb-2">投稿済み作品</h2>
          <div className="grid grid-cols-1 gap-4">
            {artworks.length === 0 && <div>投稿済み作品はありません。</div>}
            {artworks.map((art) => (
              <div
                key={art.id}
                className="p-4 border rounded cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                onClick={() => handleEdit(art.id!)}
              >
                <div className="flex items-center gap-4">
                  <img
                    src={art.imageUrl || 'https://via.placeholder.com/48x48?text=No+Image'}
                    alt={art.title}
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <span>{art.title}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MyGallery; 