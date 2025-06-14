import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Profile: React.FC = () => {
  const { user, updateNickname, isLoading } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  if (isLoading) {
    return <div className="p-8 text-center">読み込み中...</div>;
  }
  if (!user) {
    return <div className="p-8 text-center">ログインしてください。</div>;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateNickname(nickname);
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-xl shadow border">
      <h2 className="text-2xl font-bold mb-6">プロフィール編集</h2>
      <form onSubmit={handleSave} className="space-y-4">
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