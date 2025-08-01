import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithPopup, 
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
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
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