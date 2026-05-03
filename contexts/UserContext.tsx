import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { UserProfile, UserRole } from '../types';

interface UserContextType {
  profile: UserProfile | null;
  role: UserRole | null;
  isSupervisor: boolean;
  isAnalista: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | null>(null);

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
};

export const UserProvider = ({ userId, children }: { userId: string; children: React.ReactNode }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!data) {
      // Primeiro login: verifica se é o primeiro usuário do sistema
      const { data: { user } } = await supabase.auth.getUser();
      const name = user?.email?.split('@')[0] ?? 'Usuário';

      // Se não há nenhum perfil ainda, este usuário vira supervisor
      const { count } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });

      const role = (count === 0) ? 'supervisor' : 'analista';

      const { data: created } = await supabase
        .from('user_profiles')
        .insert({ user_id: userId, name, role })
        .select()
        .single();
      setProfile(created ?? null);
    } else {
      setProfile(data);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const role = profile?.role ?? null;

  return (
    <UserContext.Provider value={{
      profile,
      role,
      isSupervisor: role === 'supervisor',
      isAnalista: role === 'analista',
      loading,
      refreshProfile: fetchProfile,
    }}>
      {children}
    </UserContext.Provider>
  );
};
