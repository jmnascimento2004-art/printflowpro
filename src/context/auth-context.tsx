'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, DUMMY_PROFILES } from '@/lib/dummy-data';

interface AuthContextType {
  activeProfile: UserProfile;
  setActiveProfile: (profile: UserProfile) => void;
  hasRole: (roles: UserProfile['role'][]) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [activeProfile, setActiveProfileState] = useState<UserProfile>(DUMMY_PROFILES[0]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('printflow_active_profile');
      const storedProfiles = localStorage.getItem('printflow_profiles');
      let profilesList = DUMMY_PROFILES;
      if (storedProfiles) {
        try {
          profilesList = JSON.parse(storedProfiles);
        } catch (_) {}
      }

      if (stored) {
        const parsed = JSON.parse(stored);
        const match = profilesList.find(p => p.id === parsed.id);
        if (match) {
          setActiveProfileState(match);
        } else {
          setActiveProfileState(profilesList[0] || DUMMY_PROFILES[0]);
        }
      } else {
        setActiveProfileState(profilesList[0] || DUMMY_PROFILES[0]);
      }
      setInitialized(true);
    } catch (e) {
      console.error(e);
      setInitialized(true);
    }
  }, []);

  const setActiveProfile = (profile: UserProfile) => {
    setActiveProfileState(profile);
    try {
      localStorage.setItem('printflow_active_profile', JSON.stringify(profile));
    } catch (e) {
      console.error(e);
    }
  };

  const hasRole = (roles: UserProfile['role'][]): boolean => {
    return roles.includes(activeProfile.role);
  };

  const logout = () => {
    const storedProfiles = localStorage.getItem('printflow_profiles');
    let profilesList = DUMMY_PROFILES;
    if (storedProfiles) {
      try {
        profilesList = JSON.parse(storedProfiles);
      } catch (_) {}
    }
    setActiveProfile(profilesList[0] || DUMMY_PROFILES[0]);
  };

  return (
    <AuthContext.Provider value={{ activeProfile, setActiveProfile, hasRole, logout }}>
      {initialized ? children : <div className="min-h-screen bg-[#090d16]" />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
