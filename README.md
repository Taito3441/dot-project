# PixelShare - ドット絵共有プラットフォーム

Firebase を使用したドット絵作成・共有プラットフォームです。

## 機能

### 🎨 ドット絵エディター
- 32×32マスのキャンバス（16×16、64×64、128×128も対応）
- カラーパレット機能
- ブラシ、消しゴム、塗りつぶし、スポイトツール
- アンドゥ・リドゥ機能
- ズーム機能
- PNG形式でのダウンロード

### 🔐 認証システム
- Firebase Authentication
- Googleアカウントでのログイン
- ユーザープロフィール管理

### 📤 投稿・共有機能
- 作品のFirebase Storageへのアップロード
- Firestoreでのメタデータ管理
- 公開作品の一覧表示
- いいね・ダウンロード数の管理

### 🖼️ ギャラリー機能
- 公開作品の閲覧
- 検索・フィルタリング機能
- 作品のダウンロード
- いいね機能

### 👤 マイページ
- 自分の投稿作品一覧
- プロフィール情報表示
- 作品管理

## セットアップ

### 1. Firebase プロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成
2. Authentication を有効化し、Google プロバイダーを設定
3. Firestore Database を作成（テストモードで開始）
4. Storage を有効化
5. プロジェクト設定から設定オブジェクトを取得

### 2. Firebase 設定

`src/config/firebase.ts` ファイルの設定を更新：

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### 3. Firestore セキュリティルール

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Pixel arts collection
    match /pixelArts/{artworkId} {
      allow read: if resource.data.isPublic == true;
      allow create: if request.auth != null && request.auth.uid == resource.data.authorId;
      allow update: if request.auth != null && 
        (request.auth.uid == resource.data.authorId || 
         request.writeFields.hasOnly(['likes', 'downloads']));
      allow delete: if request.auth != null && request.auth.uid == resource.data.authorId;
    }
  }
}
```

### 4. Storage セキュリティルール

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /pixel-arts/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 技術スタック

- **フロントエンド**: React 18 + TypeScript
- **スタイリング**: Tailwind CSS
- **アイコン**: Lucide React
- **バックエンド**: Firebase
  - Authentication (Google OAuth)
  - Firestore Database
  - Storage
- **ビルドツール**: Vite

## 将来の拡張予定

### 🤖 ChatGPT 連携機能
- 色彩アドバイス
- 創作アイデア提案
- 改善提案
- テーマ別作品生成支援

実装準備として `src/services/chatgptService.ts` にサービスクラスを用意済み。

## 開発

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

## ライセンス

MIT License