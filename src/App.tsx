import React, { useState, useEffect } from 'react';
import Header from './components/Layout/Header';
import Home from './pages/Home';
import Editor from './pages/Editor';
import Profile from './pages/Profile';
import MyGallery from "./pages/MyGallery";
import { AuthProvider } from './contexts/AuthContext';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { FirebaseGallery } from './components/Gallery/FirebaseGallery';

type Page = 'home' | 'gallery' | 'editor' | 'auth' | 'mypage' | 'profile';

const App = () => {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <Router>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/gallery" element={<FirebaseGallery />} />
            <Route path="/mypage" element={<MyGallery />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:artworkId" element={<Editor />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </Router>
      </div>
    </AuthProvider>
  );
};

export default App;