import React, { useState } from 'react';
import { Chrome, Palette } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AuthFormProps {
  onSuccess: () => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const { loginWithGoogle } = useAuth();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const success = await loginWithGoogle();
      if (success) {
        onSuccess();
      } else {
        setError('ログインに失敗しました。もう一度お試しください。');
      }
    } catch (error) {
      setError('ログインエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Palette className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            PixelShare へようこそ
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ドット絵を作成・共有するコミュニティに参加しましょう
          </p>
        </div>

        <div className="bg-white shadow-xl rounded-2xl px-6 py-8 border border-gray-100">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <>
                <Chrome className="h-5 w-5 mr-3" />
                Googleでログイン
              </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              ログインすることで、利用規約とプライバシーポリシーに同意したものとみなされます。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};