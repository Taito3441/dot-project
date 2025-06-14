import React, { useState, useEffect } from 'react';
import { Header } from './components/Layout/Header';
import { Home } from './pages/Home';
import { Editor } from './pages/Editor';
import { MyPage } from './pages/MyPage';
import { FirebaseGallery } from './components/Gallery/FirebaseGallery';
import { AuthForm } from './components/Auth/AuthForm';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Profile from './pages/Profile';

type Page = 'home' | 'gallery' | 'editor' | 'auth' | 'mypage' | 'profile';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { isAuthenticated, isLoading } = useAuth();

  const handlePageChange = (page: string) => {
    setCurrentPage(page as Page);
  };

  const handleAuthSuccess = () => {
    setCurrentPage('home');
  };

  const renderCurrentPage = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">読み込み中...</p>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'home':
        return <Home onNavigate={handlePageChange} />;
      case 'gallery':
        return <FirebaseGallery />;
      case 'editor':
        return <Editor onNavigate={handlePageChange} />;
      case 'auth':
        return <AuthForm onSuccess={handleAuthSuccess} />;
      case 'mypage':
        return <MyPage onNavigate={handlePageChange} />;
      case 'profile':
        return <Profile />;
      default:
        return <Home onNavigate={handlePageChange} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {currentPage !== 'auth' && (
        <Header currentPage={currentPage} onPageChange={handlePageChange} />
      )}
      {renderCurrentPage()}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;