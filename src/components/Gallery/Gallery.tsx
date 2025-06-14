import React, { useState, useMemo } from 'react';
import { Search, Filter, Grid3X3, Grid2X2, List } from 'lucide-react';
import { PixelArt } from '../../types';
import { ArtworkCard } from './ArtworkCard';
import { downloadCanvas } from '../../utils/pixelArt';

interface GalleryProps {
  artworks: PixelArt[];
  onLike?: (artworkId: string) => void;
}

export const Gallery: React.FC<GalleryProps> = ({ artworks, onLike }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'downloads'>('newest');
  const [viewMode, setViewMode] = useState<'grid-large' | 'grid-small' | 'list'>('grid-large');

  const filteredAndSortedArtworks = useMemo(() => {
    let filtered = artworks.filter(artwork =>
      artwork.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artwork.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artwork.author.username.toLowerCase().includes(searchQuery.toLowerCase())
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
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    return filtered;
  }, [artworks, searchQuery, sortBy]);

  const handleDownload = (artwork: PixelArt) => {
    downloadCanvas(
      artwork.pixelData,
      artwork.palette,
      `${artwork.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
      10
    );
  };

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pixel Art Gallery</h1>
        <p className="text-gray-600">Discover amazing pixel art creations from our community</p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search artworks, artists..."
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
                <option value="newest">Newest</option>
                <option value="popular">Most Liked</option>
                <option value="downloads">Most Downloaded</option>
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
                title="Large Grid"
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
                title="Small Grid"
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
                title="List View"
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
          {filteredAndSortedArtworks.length} artwork{filteredAndSortedArtworks.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Gallery Grid */}
      {filteredAndSortedArtworks.length > 0 ? (
        <div className={`grid ${getGridClasses()}`}>
          {filteredAndSortedArtworks.map((artwork) => (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              onLike={onLike}
              onDownload={handleDownload}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Search className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No artworks found</h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'Try adjusting your search terms or filters'
              : 'Be the first to create and share pixel art!'}
          </p>
        </div>
      )}
    </div>
  );
};