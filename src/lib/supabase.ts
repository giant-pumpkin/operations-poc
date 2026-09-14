import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://odpdnucjvgingrrwaaiv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcGRudWNqdmdpbmdycndhYWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzM0NzAsImV4cCI6MjEwMTQwOTQ3MH0.jhxwH8-ObtoUotjlxA-34-UMzDjMcCy2iCfgv3oAdcE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const BOSS_PROFILE_ID = 'c0000000-0000-0000-0000-000000000001'
