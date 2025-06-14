import React, { useState, useEffect } from 'react';
import { Search, Filter, Grid3X3, Grid2X2, List, Download, Heart, User, Calendar } from 'lucide-react';
import { FirebasePixelArt } from '../../types';
import { PixelArtService } from '../../services/pixelArtService';
import { downloadCanvas } from '../../utils/pixelArt';

interface FirebaseGalleryProps {
  showUserOnly?: boolean;
  userId?: string;
}

export const FirebaseGallery: React.FC<FirebaseGalleryProps> = ({ 
  showUserOnly = false, 
  userId 
}) => {
  const [artworks, setArtworks] = useState<FirebasePixelArt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'downloads'>('newest');
  const [viewMode, setViewMode] = useState<'grid-large' | 'grid-small' | 'list'>('grid-large');

  useEffect(() => {
    loadArtworks();
  }, [showUserOnly, userId]);

  const loadArtworks = async () => {
    try {
      setLoading(true);
      let fetchedArtworks: FirebasePixelArt[];
      
      if (showUserOnly && userId) {
        fetchedArtworks = await PixelArtService.getUserArtworks(userId);
      } else {
        fetchedArtworks = await PixelArtService.getPublicArtworks();
      }
      
      setArtworks(fetchedArtworks);
    } catch (error) {
      console.error('Error loading artworks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (artworkId: string) => {
    try {
      await PixelArtService.likeArtwork(artworkId);
      setArtworks(prev => prev.map(artwork => 
        artwork.id === artworkId 
          ? { ...artwork, likes: artwork.likes + 1 }
          : artwork
      ));
    } catch (error) {
      console.error('Error liking artwork:', error);
    }
  };

  const handleDownload = async (artwork: FirebasePixelArt) => {
    try {
      downloadCanvas(
        artwork.pixelData,
        artwork.palette,
        `${artwork.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
        10
      );
      // Increment download count
      if (artwork.id) {
        await PixelArtService.incrementDownload(artwork.id);
        setArtworks(prev => prev.map(art => 
          art.id === artwork.id 
            ? { ...art, downloads: art.downloads + 1 }
            : art
        ));
      }
    } catch (error) {
      console.error('Error downloading artwork:', error);
    }
  };

  const filteredAndSortedArtworks = React.useMemo(() => {
    let filtered = artworks.filter(artwork =>
      artwork.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artwork.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artwork.authorName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    switch (sortBy) {
      case 'popular':
        filtered.sort((a, b) => b.likes - a.likes);
        break;
      case 'downloads':
        filtered.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return bTime.getTime() - aTime.getTime();
        });
        break;
    }

    return filtered;
  }, [artworks, searchQuery, sortBy]);

  const getGridClasses = () => {
    switch (viewMode) {
      case 'grid-small':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4';
      case 'list':
        return 'grid-cols-1 gap-6';
      case 'grid-large':
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';
    }
  };

  const formatDate = (timestamp: any) => {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {showUserOnly ? 'マイ作品' : 'ドット絵ギャラリー'}
        </h1>
        <p className="text-gray-600">
          {showUserOnly 
            ? 'あなたが作成したドット絵作品' 
            : 'コミュニティの素晴らしいドット絵作品を発見しよう'
          }
        </p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="作品、作者を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
            />
          </div>

          <div className="flex items-center space-x-4">
            {/* Sort */}
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200"
              >
                <option value="newest">新着順</option>
                <option value="popular">人気順</option>
                <option value="downloads">ダウンロード順</option>
              </select>
            </div>

            {/* View Mode */}
            <div className="flex items-center border border-gray-300 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid-large')}
                className={`p-1.5 rounded transition-colors duration-200 ${
                  viewMode === 'grid-large'
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="大きなグリッド"
              >
                <Grid2X2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('grid-small')}
                className={`p-1.5 rounded transition-colors duration-200 ${
                  viewMode === 'grid-small'
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="小さなグリッド"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors duration-200 ${
                  viewMode === 'list'
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="リスト表示"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mb-6">
        <p className="text-sm text-gray-600">
          {filteredAndSortedArtworks.length} 件の作品が見つかりました
        </p>
      </div>

      {/* Gallery Grid */}
      {filteredAndSortedArtworks.length > 0 ? (
        <div className={`grid ${getGridClasses()}`}>
          {filteredAndSortedArtworks.map((artwork) => (
            <div
              key={artwork.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              {/* Image */}
              <div className="aspect-square bg-gray-50 overflow-hidden">
                <img
                  src={artwork.imageUrl}
                  alt={artwork.title}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-lg line-clamp-1 group-hover:text-indigo-600 transition-colors duration-200">
                    {artwork.title}
                  </h3>
                  <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {artwork.width}×{artwork.height}
                  </div>
                </div>

                {artwork.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {artwork.description}
                  </p>
                )}

                {/* Author and Date */}
                <div className="flex items-center space-x-3 mb-4 text-sm text-gray-500">
                  <div className="flex items-center space-x-1">
                    <User className="h-3 w-3" />
                    <span>{artwork.authorNickname || 'ゲストさん'}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(artwork.createdAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => artwork.id && handleLike(artwork.id)}
                      className="flex items-center space-x-1 text-gray-500 hover:text-red-500 transition-colors duration-200"
                    >
                      <Heart className="h-4 w-4" />
                      <span className="text-sm">{artwork.likes}</span>
                    </button>
                    <div className="flex items-center space-x-1 text-gray-500">
                      <Download className="h-4 w-4" />
                      <span className="text-sm">{artwork.downloads}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(artwork)}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors duration-200"
                  >
                    ダウンロード
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Search className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">作品が見つかりません</h3>
          <p className="text-gray-600">
            {searchQuery
              ? '検索条件を変更してみてください'
              : '最初の作品を投稿してみましょう！'}
          </p>
        </div>
      )}
    </div>
  );
};