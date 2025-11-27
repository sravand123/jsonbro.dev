import React, { useState, useEffect } from 'react';
import { JSONViewer } from './components/JSONViewer';
import { Toaster } from 'sonner';
import './App.css';

function App() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);

    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Pass theme setter to JSONViewer
  return (
    <div className="min-h-screen">
      <JSONViewer theme={theme} setTheme={setTheme} />
      <Toaster richColors theme={theme === 'dark' ? 'dark' : 'light'} />
    </div>
  );
}

export default App;