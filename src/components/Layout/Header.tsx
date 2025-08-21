import React from "react";
import { Link } from "react-router-dom";

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow p-4 flex items-center justify-between">
      <Link to="/" className="text-xl font-bold text-blue-600" aria-label="ピクセルシェア ホーム">
        ピクセルシェア
      </Link>
      <nav className="space-x-4">
        <Link to="/gallery" className="hover:underline">ギャラリー</Link>
        <Link to="/mypage" className="hover:underline">マイギャラリー</Link>
        <Link to="/editor" className="hover:underline">新規作成</Link>
        <Link to="/profile" className="hover:underline">プロフィール</Link>
      </nav>
    </header>
  );
};

export default Header;