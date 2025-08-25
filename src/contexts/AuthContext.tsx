import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, googleProvider, db, storage } from '../config/firebase';
import { User, AuthState } from '../types';

interface AuthContextType extends AuthState {
  loginWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
  updateAvatar: (file: File) => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
      if (firebaseUser) {
        const user = await createOrGetUser(firebaseUser);
        setAuthState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
          setAuthState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } catch (err) {
        console.error('AuthContext onAuthStateChanged error:', err);
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // 端末ブラウザでのリダイレクト戻りを処理（必要に応じてエラー確認）
  useEffect(() => {
    (async () => {
      try {
        await getRedirectResult(auth);
        // 成功時は onAuthStateChanged 側で状態反映される
      } catch (err) {
        console.warn('getRedirectResult error', err);
      }
    })();
  }, []);

  const createOrGetUser = async (firebaseUser: FirebaseUser): Promise<User> => {
    if (!firebaseUser) throw new Error('No firebaseUser provided');
    const userRef = doc(db, 'users', firebaseUser.uid);
    let userSnap;
    try {
      userSnap = await getDoc(userRef);
    } catch (err) {
      console.error('getDoc error:', err);
      throw err;
    }
    if (userSnap.exists()) {
      const userData = userSnap.data();
      return {
        id: firebaseUser.uid,
        username: userData.username,
        email: userData.email,
        avatar: userData.avatar,
        createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date(),
        nickname: userData.nickname || '',
      };
    } else {
      // Create new user document
      const newUser: User = {
        id: firebaseUser.uid,
        username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Anonymous',
        email: firebaseUser.email || '',
        avatar: firebaseUser.photoURL || undefined,
        createdAt: new Date(),
        nickname: '',
      };
      try {
      await setDoc(userRef, {
        username: newUser.username,
        email: newUser.email,
        avatar: newUser.avatar,
        createdAt: new Date(),
        nickname: '',
      });
      } catch (err) {
        console.error('setDoc error:', err);
        throw err;
      }
      return newUser;
    }
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    try {
      const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
      const isInApp = /Line\//i.test(ua) || /FBAN|FBAV/i.test(ua) || /Instagram/i.test(ua) || /Twitter/i.test(ua) || /; wv\)/i.test(ua);
      if (isInApp) {
        const isAndroid = /Android/i.test(ua);
        if (isAndroid) {
          const intent = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=${location.protocol.replace(':','')};package=com.android.chrome;end`;
          try { window.location.href = intent; } catch {}
          setTimeout(() => {
            alert('アプリ内ブラウザでは Google ログインできません。Chrome など外部ブラウザで開いてからお試しください。');
          }, 400);
        } else {
          alert('アプリ内ブラウザ（LINE/Instagram等）では Google ログインできません。共有ボタン等から「Safari で開く」で外部ブラウザに移動してお試しください。');
        }
        return false;
      }
      await signInWithRedirect(auth, googleProvider);
      return true; // 実際の処理はリダイレクト後
    } catch (error: any) {
      console.error('Login failed:', error);
      // disallowed_useragent 対策のメッセージ
      if (String(error?.message || '').includes('disallowed_useragent')) {
        alert('Google によりこのブラウザではログインがブロックされています。Chrome/Safari などの外部ブラウザで開いて再度お試しください。');
      }
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updateNickname = async (nickname: string) => {
    if (!authState.user) {
      console.error('updateNickname: no user');
      return;
    }
    const userRef = doc(db, 'users', authState.user.id);
    try {
    await updateDoc(userRef, { nickname });
    setAuthState((prev) => prev.user ? {
      ...prev,
      user: { ...prev.user, nickname },
    } : prev);
    } catch (err) {
      console.error('updateNickname error:', err);
    }
  };

  const updateAvatar = async (file: File): Promise<string | undefined> => {
    if (!authState.user) {
      console.error('updateAvatar: no user');
      return;
    }
    const storageRef = ref(storage, `avatars/${authState.user.id}`);
    try {
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    const userRef = doc(db, 'users', authState.user.id);
    await updateDoc(userRef, { avatar: url });
    setAuthState((prev) => prev.user ? {
      ...prev,
      user: { ...prev.user, avatar: url },
    } : prev);
    return url;
    } catch (err) {
      console.error('updateAvatar error:', err);
      return undefined;
    }
  };

  const contextValue: AuthContextType = {
    ...authState,
    loginWithGoogle,
    logout,
    updateNickname,
    updateAvatar,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};