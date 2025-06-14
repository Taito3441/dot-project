import React from 'react';
import { User, Calendar, Heart, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FirebaseGallery } from '../components/Gallery/FirebaseGallery';

interface MyPageProps {
  onNavigate: (page: string) => void;
}

export const MyPage: React.FC<MyPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    onNavigate('auth');
    return null;
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* User Profile Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
          <div className="flex items-center space-x-6">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="h-10 w-10 text-white" />
              )}
            </div>
            
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {user.username}
              </h1>
              <p className="text-gray-600 mb-4">{user.email}</p>
              
              <div className="flex items-center space-x-6 text-sm text-gray-500">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>参加日: {formatDate(user.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <button
                onClick={() => onNavigate('editor')}
                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors duration-200"
              >
                新しい作品を作成
              </button>
            </div>
          </div>
        </div>

        {/* User's Artworks */}
        <FirebaseGallery showUserOnly={true} userId={user.id} />
      </div>
    </div>
  );
};