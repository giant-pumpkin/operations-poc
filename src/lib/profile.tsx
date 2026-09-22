import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, BOSS_PROFILE_ID } from './supabase'
import type { Profile } from './types'

interface ProfileContextValue {
  profiles: Profile[]
  profile: Profile | null
  profileId: string
  setProfileId: (id: string) => void
}

const STORAGE_KEY = 'connectiq.activeProfileId'

const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  profile: null,
  profileId: BOSS_PROFILE_ID,
  setProfileId: () => {},
})

export function useProfile() {
  return useContext(ProfileContext)
}

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || BOSS_PROFILE_ID
  } catch {
    return BOSS_PROFILE_ID
  }
}

// Stand-in for real auth: the sidebar picks who is acting, and every write stamps that profile.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profileId, setProfileIdState] = useState<string>(readStored)

  useEffect(() => {
    supabase
      .from('mock_plat_profiles')
      .select('*')
      .order('role')
      .then(({ data }) => { if (data) setProfiles(data as Profile[]) })
  }, [])

  function setProfileId(id: string) {
    setProfileIdState(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode etc. */ }
  }

  const profile = profiles.find(p => p.id === profileId) ?? null

  return (
    <ProfileContext.Provider value={{ profiles, profile, profileId, setProfileId }}>
      {children}
    </ProfileContext.Provider>
  )
}
