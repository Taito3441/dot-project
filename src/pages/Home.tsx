import React from 'react';
import { Palette, Users, Download, Heart, ArrowRight, Sparkles, Chrome } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: Palette,
      title: '高機能ドット絵エディター',
      description: '直感的なエディターで美しいドット絵を作成。高度なツール、カスタムパレット、リアルタイムプレビューを搭載。',
    },
    {
      icon: Users,
      title: 'コミュニティギャラリー',
      description: '活発なドット絵アーティストコミュニティで作品を共有し、世界中の素晴らしい作品を発見しよう。',
    },
    {
      icon: Download,
      title: '無料ダウンロード',
      description: 'プロジェクトに使える高品質なドット絵を無料でダウンロード。適切なクレジット表記で利用可能。',
    },
    {
      icon: Heart,
      title: 'ソーシャル機能',
      description: 'いいね、お気に入り、フォロー機能でお気に入りのアーティストとつながろう。',
    },
  ];

  const stats = [
    { number: '10K+', label: '作品数' },
    { number: '5K+', label: 'アーティスト' },
    { number: '50K+', label: 'ダウンロード' },
    { number: '100K+', label: 'いいね' },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%236366F1%22 fill-opacity=%220.05%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%224%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center px-4 py-2 bg-white/50 backdrop-blur-sm border border-indigo-200 rounded-full">
                <Sparkles className="h-4 w-4 text-indigo-600 mr-2" />
                <span className="text-sm font-medium text-indigo-700">作成 • 共有 • ダウンロード</span>
              </div>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              ドット絵を作成・共有
              <span className="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                完璧なピクセルアート
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
              最大のドット絵アーティストコミュニティに参加しよう。強力なエディターで素晴らしい作品を作成し、
              世界中の才能あるアーティストの創作物を発見・共有できます。
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => onNavigate(isAuthenticated ? 'editor' : 'auth')}
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-2xl hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                {isAuthenticated ? '作成を開始' : 'ログインして開始'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
              <button
                onClick={() => onNavigate('gallery')}
                className="inline-flex items-center px-8 py-4 bg-white text-gray-900 font-semibold rounded-2xl border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200"
              >
                ギャラリーを見る
              </button>
            </div>

            {!isAuthenticated && (
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl max-w-md mx-auto">
                <div className="flex items-center justify-center space-x-2 text-blue-700">
                  <Chrome className="h-5 w-5" />
                  <span className="text-sm font-medium">Googleアカウントで簡単ログイン</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                  {stat.number}
                </div>
                <div className="text-gray-600 font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              素晴らしいドット絵作成に必要なすべて
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              強力な編集ツールから活発なコミュニティまで、
              あなたのドット絵ビジョンを実現するためのすべてのリソースを提供します。
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 hover:shadow-lg hover:border-indigo-200 transition-all duration-300 group"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            あなたの傑作を作る準備はできましたか？
          </h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            すでに数千人のアーティストが素晴らしいドット絵を作成・共有しています。
          </p>
          <button
            onClick={() => onNavigate('auth')}
            className="inline-flex items-center px-8 py-4 bg-white text-indigo-600 font-semibold rounded-2xl hover:bg-gray-50 transform hover:scale-105 transition-all duration-200 shadow-lg"
          >
            無料で始める
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};