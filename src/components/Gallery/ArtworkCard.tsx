import React, { useState } from 'react';
import { Heart, Download, User, Calendar, Edit2, Trash2, Check, X } from 'lucide-react';
import { PixelArt } from '../../types';
import { FirebasePixelArt } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { PixelArtService } from '../../services/pixelArtService';

interface ArtworkCardProps {
  artwork: PixelArt | FirebasePixelArt;
  onLike?: (artworkId: string) => void;
  onDownload?: (artwork: PixelArt | FirebasePixelArt) => void;
  likedUserIds?: string[];
  currentUserId?: string;
}

export const ArtworkCard: React.FC<ArtworkCardProps> = ({
  artwork,
  onLike,
  onDownload,
  likedUserIds = [],
  currentUserId,
}) => {
  const { user } = useAuth();
  const isOwner = !!user && (artwork as any).authorId === user.id;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(artwork.title);
  const [description, setDescription] = useState(artwork.description || '');
  const formatDate = (date: Date | any) => {
    if (!date) return '';
    if (typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const isLiked = currentUserId ? likedUserIds.includes(currentUserId) : false;

  const authorName = (artwork as any).author?.username || (artwork as any).authorNickname || (artwork as any).authorName || 'ゲストさん';
  const imageUrl: string = (artwork as any).imageData || (artwork as any).imageUrl || '';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      {/* Image */}
      <div className="aspect-square bg-gray-50 overflow-hidden">
        <img
          src={imageUrl}
          alt={artwork.title}
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          {editing ? (
            <input className="flex-1 mr-2 border rounded px-2 py-1 text-sm" value={title} onChange={(e)=>setTitle(e.target.value)} />
          ) : (
            <h3 className="font-semibold text-gray-900 text-lg line-clamp-1 group-hover:text-indigo-600 transition-colors duration-200">
              {artwork.title}
            </h3>
          )}
          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {artwork.width}×{artwork.height}
          </div>
        </div>

        {editing ? (
          <textarea className="w-full border rounded px-2 py-1 text-sm mb-3" rows={3} value={description} onChange={(e)=>setDescription(e.target.value)} />
        ) : (
          artwork.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {artwork.description}
            </p>
          )
        )}

        {/* Author and Date */}
        <div className="flex items-center space-x-3 mb-4 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <User className="h-3 w-3" />
            <span>{authorName}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(artwork.createdAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {onLike && (
              <button
                onClick={() => currentUserId && artwork.id && onLike(artwork.id)}
                className={`flex items-center space-x-1 transition-colors duration-200 ${isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                disabled={!currentUserId}
                title={!currentUserId ? 'ログインしてください' : ''}
                style={!currentUserId ? { cursor: 'not-allowed' } : {}}
              >
                <Heart className="h-4 w-4" fill={isLiked ? '#ef4444' : 'none'} />
                <span className="text-sm">{artwork.likes}</span>
              </button>
            )}
            <div className="flex items-center space-x-1 text-gray-500">
              <Download className="h-4 w-4" />
              <span className="text-sm">{artwork.downloads}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
          {onDownload && !editing && (
            <button
              onClick={() => onDownload(artwork)}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors duration-200"
            >
              Download
            </button>
          )}
          {isOwner && !editing && (
            <>
              <button className="px-3 py-1.5 bg-white border text-sm rounded-lg hover:bg-gray-50" title="編集" onClick={()=>setEditing(true)}>
                <Edit2 className="h-4 w-4 inline mr-1"/>編集
              </button>
              <button className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700" title="削除" onClick={async()=>{
                if(!window.confirm('この作品を削除しますか？')) return;
                await PixelArtService.deleteArtwork((artwork as FirebasePixelArt).id!);
                window.location.reload();
              }}>
                <Trash2 className="h-4 w-4 inline mr-1"/>削除
              </button>
            </>
          )}
          {isOwner && editing && (
            <>
              <button className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700" title="保存" onClick={async()=>{
                await PixelArtService.updatePixelArt((artwork as FirebasePixelArt).id!, { title, description });
                setEditing(false);
                window.location.reload();
              }}>
                <Check className="h-4 w-4 inline mr-1"/>保存
              </button>
              <button className="px-3 py-1.5 bg-white border text-sm rounded-lg hover:bg-gray-50" title="キャンセル" onClick={()=>{setEditing(false);setTitle(artwork.title);setDescription(artwork.description||'');}}>
                <X className="h-4 w-4 inline mr-1"/>キャンセル
              </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};