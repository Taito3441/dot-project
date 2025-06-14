import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Profile: React.FC = () => {
  const { user, updateNickname, updateAvatar, isLoading } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  if (isLoading) {
    return <div className="p-8 text-center">読み込み中...</div>;
  }
  if (!user) {
    return <div className="p-8 text-center">ログインしてください。</div>;
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (avatarFile) {
      await updateAvatar(avatarFile);
    }
    await updateNickname(nickname);
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-xl shadow border">
      <h2 className="text-2xl font-bold mb-6">プロフィール編集</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-col items-center mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">プロフィールアイコン</label>
          <div className="w-24 h-24 rounded-full bg-gray-100 border flex items-center justify-center overflow-hidden mb-2">
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ニックネーム</label>
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            maxLength={20}
            required
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {success && <div className="text-green-600 text-sm mt-2">保存しました！</div>}
      </form>
      <div className="mt-8 text-gray-500 text-sm">
        <div>Googleアカウント名: {user.username}</div>
        <div>メール: {user.email}</div>
      </div>
    </div>
  );
};

export default Profile; 